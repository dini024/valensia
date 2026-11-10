#!/usr/bin/env python3
"""ORCA local agent untuk Docker Desktop (macOS/Linux/Windows). Hanya stdlib + requests.

Mode:
  serve  Server HTTP lokal 127.0.0.1:8765 (subset API /api/jobs) -> dipakai langsung oleh halaman Pages.
  poll   Outbound-only: mengambil job dari backend (POST /api/agent/claim), menjalankan Docker, mengunggah hasil.

Contoh:
  export ORCA_IMAGE=your-orca-image:tag
  python agent.py serve --origin https://USERNAME.github.io --api-key RAHASIA
  python agent.py poll  --backend https://api.contoh.id --token AGENT_TOKEN
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,127}$")
ID_RE = re.compile(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$")
JOBS_LOCK = threading.RLock()
PROCS = {}
CANCEL = set()


class Cfg:
    work = Path(os.environ.get("AGENT_WORKDIR", Path.home() / "orca-agent-jobs"))
    image = os.environ.get("ORCA_IMAGE", "your-orca-image:tag")
    docker = os.environ.get("DOCKER_BIN", "docker")
    max_nprocs = int(os.environ.get("MAX_NPROCS", 8))
    max_mem = int(os.environ.get("MAX_MEMORY_MB", 16000))
    origin = "http://localhost"
    api_key = ""
    network = os.environ.get("AGENT_DOCKER_NETWORK", "none")


# ------------------------------------------------------------------ core
def docker_cmd(job, jobdir):
    inp = job["input_name"]; out = inp[:-4] + ".out"
    mem = max(256, int(job["memory_mb"]) * int(job["nprocs"]) + 512)
    return [Cfg.docker, "run", "--rm", "--name", f"orca-{job['id']}", "--cpus", str(job["nprocs"]),
            "--memory", f"{mem}m", "--network", Cfg.network, "-v", f"{jobdir}:/work", "-w", "/work",
            job.get("orca_image") or Cfg.image, "sh", "-c", f'$(which orca) "{inp}" > "{out}" 2>&1']


def orca_ok(jobdir, inp):
    p = Path(jobdir) / (inp[:-4] + ".out")
    if not p.exists(): return False
    return "ORCA TERMINATED NORMALLY" in p.read_text(errors="replace")[-3000:]


def run_job(job, jobdir, on_status):
    """Blocking. on_status(status, message). Returns final status."""
    jid = job["id"]
    on_status("running", "docker run")
    try:
        p = subprocess.Popen(docker_cmd(job, jobdir), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        PROCS[jid] = p
        txt, _ = p.communicate()
        if jid in CANCEL: st, msg = "cancelled", "dibatalkan"
        elif p.returncode == 0 and orca_ok(jobdir, job["input_name"]): st, msg = "done", "selesai"
        else: st, msg = "failed", f"exit {p.returncode}: {(txt or '').strip()[-300:]}"
    except Exception as e:
        st, msg = "failed", str(e)
    PROCS.pop(jid, None)
    on_status(st, msg)
    return st


def kill_job(jid):
    CANCEL.add(jid)
    subprocess.run([Cfg.docker, "kill", f"orca-{jid}"], capture_output=True)
    p = PROCS.get(jid)
    if p: p.terminate()


def write_job_files(jobdir, job):
    Path(jobdir).mkdir(parents=True, exist_ok=True)
    (Path(jobdir) / job["input_name"]).write_text(job["input_text"])
    for ef in job.get("extra_files", []):
        if NAME_RE.match(ef["name"]):
            (Path(jobdir) / ef["name"]).write_bytes(base64.b64decode(ef["content_b64"]))


def validate_job(j):
    if not isinstance(j.get("input_text"), str) or len(j["input_text"]) > 1_000_000: raise ValueError("input tidak valid/terlalu besar")
    if not NAME_RE.match(str(j.get("input_name", ""))) or not j["input_name"].endswith(".inp"): raise ValueError("input_name tidak valid")
    j["nprocs"] = int(j.get("nprocs", 1)); j["memory_mb"] = int(j.get("memory_mb", 2000))
    if not 1 <= j["nprocs"] <= Cfg.max_nprocs: raise ValueError(f"nprocs 1..{Cfg.max_nprocs}")
    if not 100 <= j["memory_mb"] <= Cfg.max_mem: raise ValueError(f"memory_mb 100..{Cfg.max_mem}")
    if j.get("orca_image") and not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.:/@\-]{0,200}$", j["orca_image"]): raise ValueError("image tidak valid")
    j["name"] = re.sub(r"[^A-Za-z0-9_.\-]", "_", str(j.get("name", "job")))[:64] or "job"


# ------------------------------------------------------------------ serve mode
def meta_path(jid): return Cfg.work / jid / "agent-job.json"


def load_meta(jid):
    try: return json.loads(meta_path(jid).read_text())
    except Exception: return None


def save_meta(m):
    with JOBS_LOCK:
        meta_path(m["id"]).write_text(json.dumps(m))


def public(m):
    d = Cfg.work / m["id"]
    files = [{"name": f.name, "size": f.stat().st_size} for f in sorted(d.iterdir()) if f.is_file() and f.name != "agent-job.json"]
    return {**{k: m.get(k) for k in ("id", "name", "backend", "status", "created", "started", "finished", "nprocs", "message", "input_name")}, "files": files}


class H(BaseHTTPRequestHandler):
    server_version = "OrcaAgent/1.0"

    def log_message(self, *a): pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", Cfg.origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _send(self, code, body=b"", ctype="application/json", extra=None):
        if not isinstance(body, (bytes, bytearray)): body = json.dumps(body).encode()
        self.send_response(code); self._cors()
        self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)

    def _auth(self):
        if Cfg.api_key and self.headers.get("X-API-Key", "") != Cfg.api_key:
            self._send(401, {"detail": "API key salah"}); return False
        return True

    def do_OPTIONS(self): self._send(204)

    def _route(self):
        u = urlparse(self.path); return [unquote(p) for p in u.path.strip("/").split("/")], parse_qs(u.query)

    def do_GET(self):
        parts, q = self._route()
        if parts == ["api", "health"]:
            ok = shutil.which(Cfg.docker) is not None
            r = subprocess.run([Cfg.docker, "info", "--format", "{{.ServerVersion}}"], capture_output=True, text=True) if ok else None
            avail = bool(r and r.returncode == 0)
            return self._send(200, {"status": "ok", "version": "agent-1.0", "rdkit": False,
                                    "adapters": {"local_docker": {"available": avail, "detail": f"Docker {r.stdout.strip()}; image {Cfg.image}" if avail else "Docker Desktop belum berjalan / docker tidak ada di PATH"},
                                                 "slurm_brin": {"available": False, "detail": "tidak tersedia pada agent"}}})
        if not self._auth(): return
        if parts == ["api", "jobs"]:
            ms = [load_meta(p.name) for p in sorted(Cfg.work.iterdir(), reverse=True) if ID_RE.match(p.name)]
            return self._send(200, [public(m) for m in ms if m])
        if len(parts) >= 3 and parts[:2] == ["api", "jobs"] and ID_RE.match(parts[2]):
            m = load_meta(parts[2])
            if not m: return self._send(404, {"detail": "job tidak ditemukan"})
            if len(parts) == 3: return self._send(200, public(m))
            if parts[3] == "log":
                p = Cfg.work / m["id"] / (m["input_name"][:-4] + ".out")
                n = int(q.get("tail", ["200"])[0])
                txt = "\n".join(p.read_text(errors="replace").splitlines()[-n:]) if p.exists() else ""
                return self._send(200, txt.encode(), "text/plain; charset=utf-8", {"X-Job-Status": m["status"], "Access-Control-Expose-Headers": "X-Job-Status"})
            if parts[3] == "files" and len(parts) == 5 and NAME_RE.match(parts[4]) and parts[4] != "agent-job.json":
                p = Cfg.work / m["id"] / parts[4]
                if p.is_file(): return self._send(200, p.read_bytes(), "application/octet-stream")
        self._send(404, {"detail": "tidak ditemukan"})

    def do_POST(self):
        if not self._auth(): return
        parts, _ = self._route()
        n = int(self.headers.get("Content-Length", 0))
        if n > 30_000_000: return self._send(413, {"detail": "terlalu besar"})
        raw = self.rfile.read(n) if n else b""
        if parts == ["api", "jobs"]:
            try:
                j = json.loads(raw); validate_job(j)
            except Exception as e:
                return self._send(422, {"detail": str(e)})
            active = sum(1 for p in Cfg.work.iterdir() if ID_RE.match(p.name) and (load_meta(p.name) or {}).get("status") in ("queued", "running"))
            if active >= 2: return self._send(429, {"detail": "agen sibuk (maks 2 job aktif)"})
            jid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
            jobdir = Cfg.work / jid
            write_job_files(jobdir, j)
            m = {"id": jid, "name": j["name"], "backend": "local_docker", "status": "queued", "created": time.time(), "started": None,
                 "finished": None, "nprocs": j["nprocs"], "memory_mb": j["memory_mb"], "input_name": j["input_name"],
                 "orca_image": j.get("orca_image"), "message": ""}
            save_meta(m)

            def on_status(st, msg):
                with JOBS_LOCK:
                    mm = load_meta(jid); mm.update(status=st, message=msg)
                    if st == "running": mm["started"] = time.time()
                    if st in ("done", "failed", "cancelled"): mm["finished"] = time.time()
                    save_meta(mm)
            threading.Thread(target=run_job, args=(m, str(jobdir.resolve()), on_status), daemon=True).start()
            return self._send(200, {"id": jid, "status": "queued"})
        if len(parts) == 4 and parts[:2] == ["api", "jobs"] and parts[3] == "cancel" and ID_RE.match(parts[2]):
            m = load_meta(parts[2])
            if not m: return self._send(404, {"detail": "tidak ditemukan"})
            if m["status"] in ("queued", "running"): kill_job(m["id"])
            return self._send(200, public(load_meta(parts[2])))
        self._send(404, {"detail": "tidak ditemukan"})

    def do_DELETE(self):
        if not self._auth(): return
        parts, _ = self._route()
        if len(parts) == 3 and parts[:2] == ["api", "jobs"] and ID_RE.match(parts[2]):
            m = load_meta(parts[2])
            if not m: return self._send(404, {"detail": "tidak ditemukan"})
            if m["status"] in ("queued", "running"): return self._send(409, {"detail": "batalkan dulu"})
            shutil.rmtree(Cfg.work / parts[2]); return self._send(200, {"deleted": parts[2]})
        self._send(404, {"detail": "tidak ditemukan"})


def serve(host, port):
    Cfg.work.mkdir(parents=True, exist_ok=True)
    srv = ThreadingHTTPServer((host, port), H)
    print(f"[agent] serve http://{host}:{port}  origin diizinkan: {Cfg.origin}  workdir: {Cfg.work}", flush=True)
    srv.serve_forever()


# ------------------------------------------------------------------ poll mode
def poll(backend, token, interval):
    import requests
    hdr = {"X-Agent-Token": token}
    Cfg.work.mkdir(parents=True, exist_ok=True)
    print(f"[agent] poll {backend} setiap {interval}s", flush=True)
    while True:
        try:
            job = requests.post(f"{backend}/api/agent/claim", headers=hdr, timeout=30).json().get("job")
        except Exception as e:
            print("[agent] claim error:", e, flush=True); time.sleep(interval); continue
        if not job: time.sleep(interval); continue
        try:
            validate_job(job)
        except Exception as e:
            requests.post(f"{backend}/api/agent/{job['id']}/status", headers=hdr, json={"status": "failed", "message": str(e)}); continue
        jid = job["id"]; jobdir = (Cfg.work / jid).resolve()
        write_job_files(jobdir, job)
        out = jobdir / (job["input_name"][:-4] + ".out")
        stop = threading.Event()

        def pusher():
            sent = 0
            while True:
                last = stop.is_set()
                try:
                    if out.exists():
                        data = out.read_bytes()
                        if len(data) > sent:
                            requests.post(f"{backend}/api/agent/{jid}/log", params={"append": 1}, data=data[sent:], headers=hdr, timeout=30); sent = len(data)
                    st = requests.get(f"{backend}/api/agent/{jid}/state", headers=hdr, timeout=15).json().get("status")
                    if st == "cancelled" and jid not in CANCEL: kill_job(jid)
                except Exception as e:
                    print("[agent] push error:", e, flush=True)
                if last: return
                stop.wait(5)
        t = threading.Thread(target=pusher, daemon=True); t.start()
        final = run_job(job, str(jobdir), lambda s, m: None)
        stop.set(); t.join(60)
        for f in jobdir.iterdir():
            if f.is_file() and f.suffix.lower() in (".gbw", ".xyz", ".hess", ".molden", ".cube", ".engrad", ".txt", ".densities") or f.name.endswith(".molden.input"):
                if f.stat().st_size < 400_000_000 and NAME_RE.match(f.name):
                    try: requests.post(f"{backend}/api/agent/{jid}/file", params={"name": f.name}, data=f.read_bytes(), headers=hdr, timeout=600)
                    except Exception as e: print("[agent] upload error:", f.name, e, flush=True)
        requests.post(f"{backend}/api/agent/{jid}/status", headers=hdr, json={"status": final, "message": "agen selesai"}, timeout=30)
        print(f"[agent] {jid} -> {final}", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="mode", required=True)
    s = sp.add_parser("serve"); s.add_argument("--host", default="127.0.0.1"); s.add_argument("--port", type=int, default=8765)
    s.add_argument("--origin", default="http://localhost", help="origin halaman Pages yang diizinkan (CORS), mis. https://user.github.io")
    s.add_argument("--api-key", default=os.environ.get("AGENT_API_KEY", ""))
    p = sp.add_parser("poll"); p.add_argument("--backend", required=True); p.add_argument("--token", default=os.environ.get("AGENT_TOKEN", "")); p.add_argument("--interval", type=int, default=10)
    for x in (s, p):
        x.add_argument("--workdir"); x.add_argument("--image")
    a = ap.parse_args()
    if a.workdir: Cfg.work = Path(a.workdir)
    if a.image: Cfg.image = a.image
    if a.mode == "serve":
        Cfg.origin = a.origin; Cfg.api_key = a.api_key
        if a.host not in ("127.0.0.1", "localhost", "::1") and not a.api_key: sys.exit("host non-lokal wajib --api-key")
        serve(a.host, a.port)
    else:
        if not a.token: sys.exit("--token / AGENT_TOKEN wajib")
        poll(a.backend.rstrip("/"), a.token, a.interval)


if __name__ == "__main__":
    main()
