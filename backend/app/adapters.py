import os, re, shutil, subprocess, threading
from pathlib import Path

def _sh(cmd, timeout=60):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

class LocalDocker:
    """Jalankan ORCA di container Docker lokal. Image ORCA disediakan pengguna (lisensi ORCA)."""
    def submit(self, m, d):
        stem = Path(m["main"]).stem
        cmd = ["docker", "run", "--rm", "--name", f"cc-{m['id']}", "-v", f"{d.resolve()}:/work", "-w", "/work"]
        if os.getenv("DOCKER_PLATFORM"):
            cmd += ["--platform", os.getenv("DOCKER_PLATFORM")]
        cmd += [os.getenv("ORCA_IMAGE", "orca:latest"), "bash", "-lc", f"$(which orca) {m['main']} > {stem}.out 2>&1"]
        st = d / ".status"
        st.write_text("running")
        def run():
            try:
                rc = subprocess.call(cmd)
            except OSError as e:
                (d / (stem + ".out")).write_text(f"Gagal menjalankan docker: {e}")
                rc = 1
            if st.read_text() != "cancelled":
                st.write_text("done" if rc == 0 else "failed")
        threading.Thread(target=run, daemon=True).start()
        return {"status": "running"}
    def status(self, m, d):
        p = d / ".status"
        return p.read_text() if p.exists() else "queued"
    def cancel(self, m, d):
        (d / ".status").write_text("cancelled")
        _sh(["docker", "kill", f"cc-{m['id']}"])

class Slurm:
    """Submit ke SLURM (HPC BRIN). Jika SLURM_SSH_HOST kosong, backend dijalankan di login node."""
    OK = {"PENDING": "queued", "CONFIGURING": "queued", "RUNNING": "running", "COMPLETING": "running", "COMPLETED": "done", "CANCELLED": "cancelled"}
    BAD = {"FAILED", "TIMEOUT", "OUT_OF_MEMORY", "NODE_FAIL", "BOOT_FAIL", "DEADLINE"}
    def __init__(s):
        s.host = os.getenv("SLURM_SSH_HOST", "")
        s.root = os.getenv("SLURM_REMOTE_ROOT", "/mgpfs/home/dini024/ccjobs")
        s.part = os.getenv("SLURM_PARTITION", "")
        s.setup = os.getenv("SLURM_SETUP", "module load orca")
    def _r(s, c):
        return _sh(["ssh", s.host, c] if s.host else ["bash", "-lc", c])
    def _push(s, d, rd):
        if s.host:
            _sh(["ssh", s.host, f"mkdir -p {rd}"])
            _sh(["rsync", "-a", "--exclude=meta.json", "--exclude=.status", f"{d}/", f"{s.host}:{rd}/"], 600)
        else:
            shutil.copytree(d, rd, dirs_exist_ok=True, ignore=shutil.ignore_patterns("meta.json", ".status"))
    def _pull(s, d, rd):
        if s.host:
            _sh(["rsync", "-a", "--exclude=*.tmp*", f"{s.host}:{rd}/", f"{d}/"], 600)
        else:
            shutil.copytree(rd, d, dirs_exist_ok=True, ignore=shutil.ignore_patterns("*.tmp*"))
    def submit(s, m, d):
        rd, stem = f"{s.root}/{m['id']}", Path(m["main"]).stem
        part = f"#SBATCH -p {s.part}\n" if s.part else ""
        (d / "job.sh").write_text(
            f"#!/bin/bash\n#SBATCH -J cc_{m['id'][:8]}\n#SBATCH -N 1\n#SBATCH -n {m['nprocs']}\n{part}"
            f"#SBATCH -o slurm-%j.log\ncd {rd}\n{s.setup}\n$(which orca) {m['main']} > {stem}.out\n")
        s._push(d, rd)
        r = s._r(f"cd {rd} && sbatch job.sh")
        mm = re.search(r"Submitted batch job (\d+)", r.stdout)
        if not mm:
            raise RuntimeError(r.stderr or r.stdout)
        return {"status": "queued", "slurm_id": mm.group(1), "remote_dir": rd}
    def status(s, m, d):
        j = m["slurm_id"]
        st = s._r(f"squeue -h -j {j} -o %T").stdout.strip()
        if not st:
            lines = s._r(f"sacct -n -P -X -j {j} -o State").stdout.strip().splitlines()
            st = lines[0].split()[0] if lines else "UNKNOWN"
        s._pull(d, m["remote_dir"])
        return "failed" if st in s.BAD else s.OK.get(st, "running")
    def cancel(s, m, d):
        s._r(f"scancel {m['slurm_id']}")

ADAPTERS = {"local": LocalDocker(), "slurm": Slurm()}
