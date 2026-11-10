"""Pembangun perintah `docker run` — HANYA stdlib, tanpa impor dari app lain.

File ini identik dengan local-agent/app/adapters/docker_cmd.py (disalin oleh scripts/sync_agent.sh).
Semua string dari pengguna dikirim sebagai argumen argv (bukan di-interpolasi ke shell).
"""
import os
import posixpath
import re
import sys

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ENGINE_EXT = {"orca": (".inp",), "gaussian": (".com", ".gjf")}
ENGINES = tuple(ENGINE_EXT)

# Skrip dijalankan di dalam container. Semua nilai variabel = argumen posisi ($1..$8).
RUN_SCRIPT = r'''
ENGINE="$1"; CMD="$2"; INP="$3"; OUT="$4"; BASE="$5"; MOLDEN="$6"; CUBES="$7"; TOOLDIR="$8"
echo "[qcl] mulai: engine=$ENGINE input=$INP"
if [ "$ENGINE" = "orca" ]; then
  "$CMD" "$INP" > "$OUT" 2>&1
else
  "$CMD" < "$INP" > "$OUT" 2>&1
fi
rc=$?
echo "[qcl] program selesai, exit code $rc"
if [ "$rc" -eq 0 ] && [ "$ENGINE" = "orca" ] && [ "$MOLDEN" = "1" ] && [ -f "$BASE.gbw" ]; then
  if [ -n "$TOOLDIR" ]; then "$TOOLDIR/orca_2mkl" "$BASE" -molden; else orca_2mkl "$BASE" -molden; fi
  [ -f "$BASE.molden.input" ] && mv -f "$BASE.molden.input" "$BASE.molden"
fi
if [ "$rc" -eq 0 ] && [ "$ENGINE" = "gaussian" ] && { [ "$MOLDEN" = "1" ] || [ "$CUBES" = "1" ]; } && [ -f "$BASE.chk" ]; then
  formchk "$BASE.chk" "$BASE.fchk"
fi
exit $rc
'''


def validate_filename(name, engine=None, main=False):
    """Validasi nama file: tanpa path, tanpa karakter aneh. main=True -> cek ekstensi input engine."""
    if not isinstance(name, str) or not NAME_RE.match(name) or name in (".", ".."):
        raise ValueError(f"nama file tidak valid: {name!r} (hanya huruf/angka/._-, maks 64 karakter)")
    if main and engine:
        if not name.lower().endswith(ENGINE_EXT[engine]):
            raise ValueError(f"ekstensi input untuk {engine} harus {'/'.join(ENGINE_EXT[engine])}")
    return name


def stem(name):
    return name.rsplit(".", 1)[0]


def output_name(engine, input_filename):
    return stem(input_filename) + (".out" if engine == "orca" else ".log")


def container_user(setting):
    if setting and setting != "auto":
        return setting
    if setting == "auto" and sys.platform.startswith("linux") and hasattr(os, "getuid"):
        return f"{os.getuid()}:{os.getgid()}"
    return ""


def build_docker_argv(job, jobdir, *, docker_bin, image, engine_cmd, platform="", user="auto"):
    """Kembalikan list argv untuk `docker run`. `job` memakai kunci: id, engine, input_filename, resources, post."""
    engine = job["engine"]
    inp = validate_filename(job["input_filename"], engine, main=True)
    out = output_name(engine, inp)
    res = job.get("resources") or {}
    post = job.get("post") or {}
    argv = [docker_bin, "run", "--rm", "--name", f"qcl-{job['id']}"]
    if platform:
        argv += ["--platform", platform]
    cpus = res.get("nprocs")
    if cpus:
        argv += ["--cpus", str(int(cpus))]
    mem = res.get("memory_mb")
    if mem:
        argv += ["--memory", f"{int(mem)}m"]
    u = container_user(user)
    if u:
        argv += ["--user", u]
    argv += ["-e", "HOME=/tmp", "-e", "OMPI_ALLOW_RUN_AS_ROOT=1", "-e", "OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1",
             "-e", "OMPI_MCA_rmaps_base_oversubscribe=1",
             "-v", f"{os.fspath(jobdir)}:/work", "-w", "/work", image,
             "bash", "-c", RUN_SCRIPT, "qcl-run",
             engine, engine_cmd, inp, out, stem(inp),
             "1" if post.get("molden") else "0", "1" if post.get("cubes") else "0",
             posixpath.dirname(engine_cmd) if "/" in engine_cmd else ""]
    return argv


def argv_to_display(argv):
    """String yang bisa dibaca manusia (RUN_SCRIPT diringkas)."""
    import shlex
    return " ".join(shlex.quote(a) if a != RUN_SCRIPT else "'<skrip-run>'" for a in argv)
