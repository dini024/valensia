"""Adapter palsu untuk uji dan demo (FAKE_ADAPTER=1). Menulis keluaran ORCA contoh secara bertahap."""
import threading, time
from typing import Dict, Any, Tuple
from .. import store
from .base import Adapter

_cancel = set()
SAMPLE = """\
                                 * O   R   C   A *
 Program Version 6.0.0 (SIMULASI - bukan keluaran ORCA asli)
INPUT FILE
NAME = {inp}
----------------------------------------------------------------------------
ITER       Energy         Delta-E        Max-DP      RMS-DP      [F,P]     Damp
  0   -76.2653422543   0.000000000000  0.01841432  0.00104532  0.0412371 0.7000
  1   -76.2698700313  -0.004527777000  0.00950410  0.00055201  0.0221050 0.7000
  2   -76.2712230871  -0.001353055800  0.00010241  0.00001021  0.0003302 0.0000
  3   -76.2712262412  -0.000003154100  0.00000321  0.00000012  0.0000051 0.0000
               *****************************************************
               *                     SUCCESS                       *
               *****************************************************
FINAL SINGLE POINT ENERGY       -76.271226241200
                             ****ORCA TERMINATED NORMALLY****
TOTAL RUN TIME: 0 days 0 hours 0 minutes 4 seconds 100 msec
"""


class FakeAdapter(Adapter):
    def __init__(self, name="local_docker", delay=0.4):
        self.name = name; self.delay = delay

    def available(self) -> Tuple[bool, str]:
        return True, "FAKE adapter (simulasi, tanpa Docker)"

    def submit(self, job: Dict[str, Any]) -> None:
        jid = job["id"]

        def run():
            store.update(jid, status="running", started=time.time(), message="simulasi")
            p = store.job_dir(jid) / (job["input_name"][:-4] + ".out")
            lines = SAMPLE.format(inp=job["input_name"]).splitlines(True)
            with open(p, "w") as f:
                for ln in lines:
                    if jid in _cancel:
                        store.update(jid, status="cancelled", finished=time.time(), message="dibatalkan"); return
                    f.write(ln); f.flush(); time.sleep(self.delay)
            store.update(jid, status="done", finished=time.time(), message="selesai (simulasi)")
        threading.Thread(target=run, daemon=True).start()

    def cancel(self, job):
        _cancel.add(job["id"])
