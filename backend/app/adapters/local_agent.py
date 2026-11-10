"""Adapter antrean: job menunggu 'queued' sampai agen di MacBook mengambilnya (POST /api/agent/claim)."""
from typing import Dict, Any, Tuple
from .base import Adapter


class LocalAgentAdapter(Adapter):
    name = "local_agent"

    def available(self) -> Tuple[bool, str]:
        from .. import config
        if not config.AGENT_TOKEN:
            return False, "AGENT_TOKEN belum diset; agen tidak dapat mengklaim job"
        return True, "antrean aktif; jalankan local-agent/agent.py poll di MacBook"

    def submit(self, job: Dict[str, Any]) -> None:
        pass  # tetap queued sampai di-claim

    def cancel(self, job: Dict[str, Any]) -> None:
        pass  # agen membaca status 'cancelled' pada polling berikutnya
