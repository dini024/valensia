"""Adapter Docker lokal: `docker run --rm` dengan folder job di-mount ke /work."""
import shutil
import subprocess
import time
from pathlib import Path

from .base import Adapter, AdapterError
from .docker_cmd import argv_to_display, build_docker_argv


class LocalDockerAdapter(Adapter):
    name = "local-docker"

    def __init__(self):
        self.procs = {}
        self._avail = (0.0, (False, ""))

    def image(self, job, s):
        return s.orca_image if job["engine"] == "orca" else s.gaussian_image

    def engine_cmd(self, job, s):
        return s.orca_cmd if job["engine"] == "orca" else s.gaussian_cmd

    def available(self, s):
        if time.time() - self._avail[0] < 10:
            return self._avail[1]
        if not shutil.which(s.docker_bin):
            res = (False, f"perintah '{s.docker_bin}' tidak ditemukan di PATH")
        else:
            try:
                r = subprocess.run([s.docker_bin, "info", "--format", "{{.ServerVersion}}"], capture_output=True, text=True, timeout=5)
                res = (True, f"Docker {r.stdout.strip()} · image ORCA={s.orca_image}") if r.returncode == 0 else \
                      (False, "docker CLI ada, tetapi daemon tidak merespons (Docker Desktop belum jalan?)")
            except Exception as e:  # noqa: BLE001
                res = (False, f"gagal memeriksa docker: {e}")
        self._avail = (time.time(), res)
        return res

    def build(self, job, jobdir, s):
        return build_docker_argv(job, jobdir, docker_bin=s.docker_bin, image=self.image(job, s),
                                 engine_cmd=self.engine_cmd(job, s), platform=s.docker_platform, user=s.docker_user)

    def submit(self, job, jobdir, s):
        argv = self.build(job, Path(jobdir).resolve(), s)
        try:
            log = open(Path(jobdir) / "stdout.log", "ab")
            self.procs[job["id"]] = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                                     cwd=str(jobdir), start_new_session=True)
        except OSError as e:
            raise AdapterError(f"tidak bisa menjalankan docker: {e}") from e
        return f"qcl-{job['id']}", argv_to_display(argv)

    def poll(self, job, jobdir, s):
        p = self.procs.get(job["id"])
        if p is None:
            return "failed", None
        rc = p.poll()
        if rc is None:
            return "running", None
        return ("completed", 0) if rc == 0 else ("failed", rc)

    def cancel(self, job, jobdir, s):
        try:
            subprocess.run([s.docker_bin, "rm", "-f", f"qcl-{job['id']}"], capture_output=True, timeout=20)
        except Exception:  # noqa: BLE001
            pass
        p = self.procs.get(job["id"])
        if p and p.poll() is None:
            p.terminate()
