"""Antarmuka adapter eksekusi job."""
from abc import ABC, abstractmethod
from pathlib import Path


class AdapterError(Exception):
    pass


TERMINAL = ("completed", "failed", "cancelled")


class Adapter(ABC):
    name = "base"
    max_concurrent = 4

    def image(self, job, s):
        return None

    def available(self, s):
        """-> (bool, detail str)"""

    def submit(self, job: dict, jobdir: Path, s):
        """Mulai job. -> (runtime_id, command_str). Raise AdapterError bila gagal."""

    def poll(self, job: dict, jobdir: Path, s):
        """-> (status in queued|running|completed|failed|cancelled, exit_code|None)"""

    def cancel(self, job: dict, jobdir: Path, s):
        """Hentikan job."""

    def collect(self, job: dict, jobdir: Path, s):
        """Ambil hasil ke jobdir (default: tidak perlu)."""

    def refresh(self, m):
        from .. import store
        return store.load(m["id"]) or m
