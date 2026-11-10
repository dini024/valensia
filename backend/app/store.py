"""Penyimpanan job berbasis file JSON: data/jobs/<id>/job.json + berkas kerja."""
import json, os, re, threading, time, uuid
from pathlib import Path
from typing import Optional, List, Dict, Any
from . import config

_lock = threading.RLock()
SAFE_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,127}$")
HIDDEN = {"job.json"}


def jobs_dir() -> Path:
    d = config.DATA_DIR / "jobs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def new_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]


def job_dir(job_id: str) -> Path:
    if not re.match(r"^[0-9]{8}-[0-9]{6}-[0-9a-f]{6}$", job_id):
        raise KeyError(job_id)
    return jobs_dir() / job_id


def create(meta: Dict[str, Any]) -> Dict[str, Any]:
    jid = new_id()
    d = job_dir(jid); d.mkdir(parents=True)
    meta = dict(meta, id=jid, status="queued", created=time.time(), started=None, finished=None, message="")
    save(meta)
    return meta


def save(meta: Dict[str, Any]) -> None:
    d = job_dir(meta["id"])
    with _lock:
        tmp = d / "job.json.tmp"
        tmp.write_text(json.dumps(meta, indent=1))
        os.replace(tmp, d / "job.json")


def load(job_id: str) -> Optional[Dict[str, Any]]:
    try:
        p = job_dir(job_id) / "job.json"
        with _lock:
            return json.loads(p.read_text())
    except (KeyError, FileNotFoundError, json.JSONDecodeError):
        return None


def update(job_id: str, **kw) -> Optional[Dict[str, Any]]:
    with _lock:
        m = load(job_id)
        if m is None:
            return None
        m.update(kw)
        save(m)
        return m


def list_all() -> List[Dict[str, Any]]:
    out = []
    for p in sorted(jobs_dir().iterdir(), reverse=True):
        m = load(p.name)
        if m:
            out.append(m)
    return out


def files(job_id: str) -> List[Dict[str, Any]]:
    d = job_dir(job_id)
    res = []
    for f in sorted(d.iterdir()):
        if f.is_file() and f.name not in HIDDEN and not f.name.endswith(".tmp"):
            res.append({"name": f.name, "size": f.stat().st_size})
    return res


def file_path(job_id: str, name: str) -> Optional[Path]:
    if not SAFE_FILE.match(name) or name in HIDDEN:
        return None
    p = (job_dir(job_id) / name).resolve()
    if p.parent != job_dir(job_id).resolve() or not p.is_file():
        return None
    return p


def delete(job_id: str) -> bool:
    import shutil
    d = job_dir(job_id)
    if d.exists():
        shutil.rmtree(d)
        return True
    return False


def active_count() -> int:
    return sum(1 for m in list_all() if m["status"] in ("queued", "running"))


def tail_text(path: Path, n: int) -> str:
    n = max(1, min(n, 20000))
    with open(path, "rb") as f:
        f.seek(0, 2); size = f.tell()
        block, data = 65536, b""
        while size > 0 and data.count(b"\n") <= n:
            step = min(block, size); size -= step
            f.seek(size); data = f.read(step) + data
    return "\n".join(data.decode("utf-8", "replace").splitlines()[-n:])
