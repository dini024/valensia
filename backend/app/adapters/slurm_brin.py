"""Adapter SLURM-over-SSH (dirancang untuk HPC BRIN, tetapi generik).

PENTING: nama partisi, akun, modul, dan path ORCA di cluster BRIN TIDAK diketahui oleh penulis kode ini.
Isi sendiri lewat env BRIN_* (lihat .env.example) dan uji dengan job kecil lebih dulu.
Autentikasi memakai ssh key (BatchMode=yes -> tidak ada prompt password).
"""
import re
import shutil
import subprocess
from pathlib import Path

from .base import Adapter, AdapterError
from .docker_cmd import output_name, stem

SAFE_PATH = re.compile(r"^[~/A-Za-z0-9._-]+$")
SAFE_TOKEN = re.compile(r"^[A-Za-z0-9._/+-]+$")
WALLTIME = re.compile(r"^(\d+-)?\d{1,3}:\d{2}:\d{2}$")


def _run(argv, timeout=60, input_text=None):
    """Satu-satunya titik panggil subprocess (di-monkeypatch pada test)."""
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout, input=input_text)


def map_state(state):
    st = (state or "").split()[0].upper().rstrip("+") if state else ""
    if st in ("PENDING", "CONFIGURING", "REQUEUED", "RESV_DEL_HOLD", "SUSPENDED"):
        return "queued"
    if st in ("RUNNING", "COMPLETING", "STAGE_OUT", "RESIZING"):
        return "running"
    if st == "COMPLETED":
        return "completed"
    if st.startswith("CANCELLED"):
        return "cancelled"
    if st:
        return "failed"  # FAILED, TIMEOUT, OUT_OF_MEMORY, NODE_FAIL, BOOT_FAIL, DEADLINE ...
    return ""


class SlurmBrinAdapter(Adapter):
    name = "brin-slurm"
    max_concurrent = 8

    def __init__(self):
        self.misses = {}

    # ---- helpers (pure) ----
    def remote_dir(self, job, s):
        base = s.brin_remote_base.rstrip("/")
        if not SAFE_PATH.match(base):
            raise AdapterError("BRIN_REMOTE_BASE berisi karakter tidak aman")
        return f"{base}/{job['id']}"

    @staticmethod
    def shell_path(p):
        return "$HOME/" + p[2:] if p.startswith("~/") else p

    @staticmethod
    def scp_path(p):
        return p[2:] if p.startswith("~/") else p

    def ssh_opts(self, s):
        o = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=accept-new"]
        return o

    def ssh_argv(self, s, remote_cmd):
        a = ["ssh", "-p", str(s.brin_port)] + (["-i", s.brin_key] if s.brin_key else []) + self.ssh_opts(s)
        return a + [f"{s.brin_user}@{s.brin_host}", remote_cmd]

    def scp_upload_argv(self, s, files, remote_dir):
        a = ["scp", "-P", str(s.brin_port)] + (["-i", s.brin_key] if s.brin_key else []) + self.ssh_opts(s)
        return a + [str(f) for f in files] + [f"{s.brin_user}@{s.brin_host}:{self.scp_path(remote_dir)}/"]

    def fetch_argv(self, s, remote_dir, jobdir):
        src = f"{s.brin_user}@{s.brin_host}:{self.scp_path(remote_dir)}/"
        if shutil.which("rsync"):
            ssh = "ssh -p %d%s -o BatchMode=yes -o ConnectTimeout=15" % (s.brin_port, f" -i {s.brin_key}" if s.brin_key else "")
            a = ["rsync", "-az", "-e", ssh]
            for pat in [p.strip() for p in s.brin_fetch_exclude.split(",") if p.strip()]:
                a += ["--exclude", pat]
            return a + [src, f"{jobdir}/"]
        a = ["scp", "-r", "-P", str(s.brin_port)] + (["-i", s.brin_key] if s.brin_key else []) + self.ssh_opts(s)
        return a + [src + ".", f"{jobdir}/"]

    def build_script(self, job, s, remote_dir=None):
        """Teks skrip sbatch. Semua nilai divalidasi regex sebelum masuk skrip."""
        res = job.get("resources") or {}
        engine = job["engine"]
        inp = job["input_filename"]
        out = output_name(engine, inp)
        nprocs = int(res.get("nprocs") or 1)
        mem = int(res.get("memory_mb") or 0)
        walltime = res.get("walltime") or "24:00:00"
        if not WALLTIME.match(walltime):
            raise AdapterError("walltime harus berformat [D-]HH:MM:SS")
        partition = res.get("partition") or s.brin_partition
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", job.get("name") or job["id"])[:32] or job["id"]
        lines = ["#!/bin/bash", f"#SBATCH --job-name=qcl-{name}"]
        for flag, val in (("--partition", partition), ("--account", s.brin_account)):
            if val:
                if not SAFE_TOKEN.match(val):
                    raise AdapterError(f"nilai {flag} tidak aman: {val!r}")
                lines.append(f"#SBATCH {flag}={val}")
        lines += ["#SBATCH --nodes=1", f"#SBATCH --ntasks={nprocs}"]
        if mem:
            lines.append(f"#SBATCH --mem={mem}M")
        lines += [f"#SBATCH --time={walltime}", "#SBATCH --output=slurm-%j.out", "", "cd \"$SLURM_SUBMIT_DIR\" || exit 1"]
        for m in [x.strip() for x in s.brin_modules.split(",") if x.strip()]:
            if not SAFE_TOKEN.match(m):
                raise AdapterError(f"nama modul tidak aman: {m!r}")
            lines.append(f"module load {m}")
        post = job.get("post") or {}
        if engine == "orca":
            exe = s.brin_orca_bin
            if not exe or not SAFE_PATH.match(exe):
                raise AdapterError("BRIN_ORCA_BIN belum diisi / tidak aman (harus path lengkap ke 'orca' di cluster)")
            lines += [f"ORCA={exe}", f'"$ORCA" {inp} > {out} 2>&1', "rc=$?"]
            if post.get("molden"):
                lines += [f'if [ "$rc" -eq 0 ] && [ -f {stem(inp)}.gbw ]; then "$(dirname "$ORCA")/orca_2mkl" {stem(inp)} -molden && mv -f {stem(inp)}.molden.input {stem(inp)}.molden; fi']
        else:
            g = s.brin_gaussian_cmd
            if not SAFE_TOKEN.match(g):
                raise AdapterError("BRIN_GAUSSIAN_CMD tidak aman")
            lines += [f"{g} < {inp} > {out} 2>&1", "rc=$?"]
            if post.get("molden") or post.get("cubes"):
                lines += [f"if [ \"$rc\" -eq 0 ] && [ -f {stem(inp)}.chk ]; then formchk {stem(inp)}.chk {stem(inp)}.fchk; fi"]
        lines += ["echo $rc > exit_code.txt", "exit $rc", ""]
        return "\n".join(lines)

    # ---- Adapter API ----
    def available(self, s):
        if not (s.brin_host and s.brin_user):
            return False, "BRIN_HOST / BRIN_USER belum diisi"
        ok = bool(shutil.which("ssh"))
        return (ok, f"{s.brin_user}@{s.brin_host}:{s.brin_port} (koneksi belum diuji; ssh key dibutuhkan)") if ok else (False, "ssh tidak ditemukan")

    def submit(self, job, jobdir, s):
        rdir = self.remote_dir(job, s)
        script = self.build_script(job, s, rdir)
        jobdir = Path(jobdir)
        (jobdir / "job.sbatch").write_text(script)
        r = _run(self.ssh_argv(s, f"mkdir -p {self.shell_path(rdir)}"))
        if r.returncode:
            raise AdapterError(f"ssh mkdir gagal: {r.stderr.strip()[:300]}")
        files = [jobdir / "job.sbatch", jobdir / job["input_filename"]] + [jobdir / n for n in (job.get("extra_files") or [])]
        r = _run(self.scp_upload_argv(s, files, rdir), timeout=300)
        if r.returncode:
            raise AdapterError(f"scp upload gagal: {r.stderr.strip()[:300]}")
        r = _run(self.ssh_argv(s, f"cd {self.shell_path(rdir)} && sbatch --parsable job.sbatch"))
        if r.returncode:
            raise AdapterError(f"sbatch gagal: {r.stderr.strip()[:300]}")
        sid = r.stdout.strip().split(";")[0].strip()
        if not sid.isdigit():
            raise AdapterError(f"keluaran sbatch tidak dikenali: {r.stdout[:100]!r}")
        return sid, " ".join(self.ssh_argv(s, f"sbatch --parsable job.sbatch")[:-1]) + f" 'cd {rdir} && sbatch --parsable job.sbatch'"

    def poll(self, job, jobdir, s):
        sid = str(job.get("runtime_id") or "")
        if not sid.isdigit():
            return "failed", None
        rdir = self.shell_path(self.remote_dir(job, s))
        out = output_name(job["engine"], job["input_filename"])
        cmd = (f"squeue -h -j {sid} -o %T 2>/dev/null; echo '---SACCT'; sacct -n -P -X -j {sid} -o State,ExitCode 2>/dev/null | head -1; "
               f"echo '---EXIT'; cat {rdir}/exit_code.txt 2>/dev/null; echo '---TAIL'; tail -n 200 {rdir}/{out} 2>/dev/null")
        r = _run(self.ssh_argv(s, cmd), timeout=60)
        if r.returncode:
            return "running", None  # gangguan jaringan sementara -> jangan gagalkan job
        txt = r.stdout
        sq, _, rest = txt.partition("---SACCT")
        sacct, _, rest = rest.partition("---EXIT")
        ex, _, tail = rest.partition("---TAIL")
        if tail.strip():
            (Path(jobdir) / "remote_tail.log").write_text(tail.lstrip("\n"))
        st = map_state(sq.strip())
        code = None
        if not st and sacct.strip():
            state, _, ec = sacct.strip().partition("|")
            st = map_state(state)
            if ec.strip():
                try:
                    code = int(ec.split(":")[0])
                except ValueError:
                    pass
        if not st and ex.strip().lstrip("-").isdigit():
            code = int(ex.strip())
            st = "completed" if code == 0 else "failed"
        if not st:
            n = self.misses[sid] = self.misses.get(sid, 0) + 1
            return ("failed", None) if n > 5 else ("running", None)
        self.misses.pop(sid, None)
        if st == "completed" and code is None:
            code = 0
        return st, code

    def cancel(self, job, jobdir, s):
        sid = str(job.get("runtime_id") or "")
        if sid.isdigit():
            _run(self.ssh_argv(s, f"scancel {sid}"))

    def collect(self, job, jobdir, s):
        r = _run(self.fetch_argv(s, self.remote_dir(job, s), Path(jobdir)), timeout=1800)
        if r.returncode:
            raise AdapterError(f"mengambil hasil gagal: {r.stderr.strip()[:300]}")


def sbatch_script(meta, workdir):
    """Templat sbatch ringkas untuk ditinjau pengguna (tanpa konfigurasi cluster). Baris bertanda TODO
    harus disesuaikan dengan modul/path ORCA di HPC BRIN Anda."""
    inp = meta.get("input_name", "job.inp")
    out = inp[:-4] + ".out" if inp.lower().endswith(".inp") else inp + ".out"
    name = re.sub(r"[^A-Za-z0-9_.-]", "_", str(meta.get("name") or "job"))[:32]
    lines = ["#!/bin/bash", f"#SBATCH --job-name=qcl-{name}", "#SBATCH --nodes=1", f"#SBATCH --ntasks={int(meta.get('nprocs', 1))}",
             f"#SBATCH --mem={int(meta.get('memory_mb', 2000))}M", f"#SBATCH --time={meta.get('walltime', '24:00:00')}",
             "#SBATCH --output=slurm-%j.out", "# TODO: tambahkan --partition / --account sesuai kebijakan BRIN",
             "", f"cd {workdir}", "# TODO: module load openmpi orca   (nama modul bergantung pada cluster)",
             "# TODO: ORCA=/path/lengkap/ke/orca", f'"$ORCA" {inp} > {out} 2>&1', ""]
    return "\n".join(lines)
