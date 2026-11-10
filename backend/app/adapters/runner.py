"""Pembungkus: menjalankan adapter nyata (LocalDocker / SlurmBrin) dengan thread latar,
dan memperbarui status job di store. Antarmuka: available(), submit(meta), refresh(meta), cancel(meta)."""
import threading
import time
from pathlib import Path

from .. import config, store
from .base import AdapterError


class Runner:
    def __init__(self, adapter, name):
        self.adapter, self.name = adapter, name
        self._cancel = set()
        self._threads = {}

    def _settings(self):
        s = config.load_settings()
        s.data_dir = config.DATA_DIR
        s.orca_image = config.ORCA_IMAGE
        s.brin_host = s.brin_host or config.BRIN_HOST
        s.brin_user = s.brin_user or config.BRIN_USER
        s.brin_remote_base = config.BRIN_WORKDIR or s.brin_remote_base
        return s

    def available(self):
        return self.adapter.available(self._settings())

    def _job(self, m):
        d = store.job_dir(m["id"])
        extras = sorted(p.name for p in d.iterdir() if p.is_file() and p.name not in (m["input_name"], "job.json", "job.json.tmp"))
        return {"id": m["id"], "name": m.get("name"), "engine": "orca", "input_filename": m["input_name"], "extra_files": extras,
                "resources": {"nprocs": m.get("nprocs", 1), "memory_mb": m.get("memory_mb"), "walltime": m.get("walltime")},
                "post": {"molden": True}, "runtime_id": m.get("runtime_id"), "orca_image": m.get("orca_image")}

    def submit(self, m):
        jid = m["id"]
        t = threading.Thread(target=self._run, args=(jid,), daemon=True, name=f"job-{jid}")
        self._threads[jid] = t
        t.start()

    def _run(self, jid):
        s = self._settings(); d = store.job_dir(jid)
        try:
            m = store.load(jid); job = self._job(m)
            rid, cmd = self.adapter.submit(job, d, s)
            store.update(jid, status="running", started=time.time(), runtime_id=rid, command=cmd, message="berjalan")
            job["runtime_id"] = rid
            while True:
                time.sleep(s.poll_interval)
                if jid in self._cancel:
                    self.adapter.cancel(job, d, s)
                    store.update(jid, status="cancelled", finished=time.time(), message="dibatalkan"); return
                st, rc = self.adapter.poll(job, d, s)
                if st in ("completed", "failed", "cancelled"):
                    try:
                        self.adapter.collect(job, d, s)
                    except Exception as e:  # noqa: BLE001
                        store.update(jid, message=f"collect gagal: {e}")
                    store.update(jid, status={"completed": "done"}.get(st, st), finished=time.time(), exit_code=rc,
                                 message="selesai" if st == "completed" else f"{st} (kode {rc})")
                    return
        except AdapterError as e:
            store.update(jid, status="failed", finished=time.time(), message=str(e))
        except Exception as e:  # noqa: BLE001
            store.update(jid, status="failed", finished=time.time(), message=f"error internal: {e}")

    def refresh(self, m):
        return store.load(m["id"]) or m

    def cancel(self, m):
        self._cancel.add(m["id"])
