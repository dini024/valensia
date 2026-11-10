"""Uji agent dengan shim docker palsu (tanpa Docker sungguhan). Jalankan: python tests/test_agent.py"""
import json, os, sys, threading, time, urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent
import tempfile

tmp = Path(tempfile.mkdtemp())
agent.Cfg.work = tmp; agent.Cfg.docker = str(Path(__file__).parent / "fake_docker.sh")
agent.Cfg.origin = "https://u.github.io"; agent.Cfg.api_key = "k"
srv = ThreadingHTTPServer(("127.0.0.1", 0), agent.H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}"


def call(path, method="GET", body=None, key="k"):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e: return e.code, e.read(), dict(e.headers)

s, b, h = call("/api/health"); assert s == 200 and json.loads(b)["adapters"]["local_docker"]["available"], b
assert h["Access-Control-Allow-Origin"] == "https://u.github.io"
assert call("/api/jobs", key="bad")[0] == 401
assert call("/api/jobs", "POST", {"input_text": "!HF", "input_name": "../x.inp"})[0] == 422
s, b, _ = call("/api/jobs", "POST", {"name": "t", "input_name": "job.inp", "input_text": "! HF\n", "nprocs": 2, "memory_mb": 500})
assert s == 200; jid = json.loads(b)["id"]
for _ in range(30):
    st = json.loads(call(f"/api/jobs/{jid}")[1])
    if st["status"] in ("done", "failed"): break
    time.sleep(0.3)
assert st["status"] == "done", st
assert {f["name"] for f in st["files"]} >= {"job.inp", "job.out", "job.gbw"}
s, b, h = call(f"/api/jobs/{jid}/log?tail=5"); assert b"TERMINATED NORMALLY" in b and h["X-Job-Status"] == "done"
assert call(f"/api/jobs/{jid}/files/agent-job.json")[0] == 404
assert call(f"/api/jobs/{jid}", "DELETE")[0] == 200
print("agent tests OK")
