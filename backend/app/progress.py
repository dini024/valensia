"""Parser progres keluaran ORCA (dipanggil berulang pada log yang sedang tumbuh).

Pola yang dikenali:
  SCF  : baris iterasi tabel, mis. "   0   -228.1234567890   0.000000000000 ..." di bawah header
         "ITER       Energy         Delta-E ..."  (ORCA 5/6), atau format lama "ITERATION ... ENERGY ... DELTA-E".
  OPT  : "GEOMETRY OPTIMIZATION CYCLE  3", "FINAL SINGLE POINT ENERGY", tabel "RMS gradient" / "MAX gradient".
  FREQ : "VIBRATIONAL FREQUENCIES" / "ORCA NUMERICAL FREQUENCIES"
  TDDFT: "TD-DFT/TDA EXCITED STATES" / "ABSORPTION SPECTRUM"
  DONE : "ORCA TERMINATED NORMALLY"
"""
import re
from typing import Optional

from .models import IterPoint, OptCycle, Progress

_F = r"[-+]?\d+\.\d+(?:[eE][-+]?\d+)?"
RE_SCF_ROW = re.compile(rf"^\s*(\d+)\s+({_F})\s+({_F})\s")           # ITER Energy Delta-E ...
RE_SCF_OLD = re.compile(rf"^\s*(\d+)\s+({_F})\s+({_F})\s+({_F})")
RE_CYCLE = re.compile(r"GEOMETRY OPTIMIZATION CYCLE\s+(\d+)")
RE_FSPE = re.compile(rf"FINAL SINGLE POINT ENERGY\s+({_F})")
RE_RMSG = re.compile(rf"RMS gradient\s+({_F})")
RE_MAXG = re.compile(rf"MAX gradient\s+({_F})")
RE_CONV = re.compile(r"THE OPTIMIZATION HAS CONVERGED|\*\*\*\s*OPTIMIZATION RUN DONE\s*\*\*\*|HURRAY")
RE_SCF_CONV = re.compile(r"SCF CONVERGED AFTER\s+(\d+)\s+CYCLES|SUCCESS(?:FULLY)? .*SCF")
RE_SCF_START = re.compile(r"SCF ITERATIONS|ITERATION\s+ENERGY\s+DELTA-E|^\s*ITER\s+Energy\s+Delta-E", re.I)


def parse_progress(text: str) -> Progress:
    p = Progress()
    if not text.strip():
        return p
    scf: list = []
    cycles: dict = {}
    cur_cycle: Optional[int] = None
    in_scf = False
    phase = "SCF"
    last_energy = None
    for line in text.splitlines():
        if RE_SCF_START.search(line):
            in_scf = True
            scf = []  # hanya simpan SCF terbaru (mis. siklus optimisasi terakhir)
            continue
        if in_scf:
            m = RE_SCF_ROW.match(line)
            if m:
                scf.append(IterPoint(iter=int(m.group(1)), energy=float(m.group(2)), delta=float(m.group(3))))
                last_energy = float(m.group(2))
                continue
            if RE_SCF_CONV.search(line) or "SCF NOT CONVERGED" in line or line.strip().startswith("*") and scf:
                in_scf = False
        m = RE_CYCLE.search(line)
        if m:
            cur_cycle = int(m.group(1))
            cycles.setdefault(cur_cycle, OptCycle(cycle=cur_cycle))
            phase = "OPT"
        m = RE_FSPE.search(line)
        if m:
            last_energy = float(m.group(1))
            if cur_cycle is not None:
                cycles.setdefault(cur_cycle, OptCycle(cycle=cur_cycle)).energy = last_energy
        m = RE_RMSG.search(line)
        if m and cur_cycle is not None:
            cycles[cur_cycle].rms_grad = float(m.group(1))
        m = RE_MAXG.search(line)
        if m and cur_cycle is not None:
            cycles[cur_cycle].max_grad = float(m.group(1))
        if RE_CONV.search(line):
            p.converged = True
        if "VIBRATIONAL FREQUENCIES" in line or "NUMERICAL FREQUENCIES" in line or "ANALYTICAL FREQUENCIES" in line:
            phase = "FREQ"
        if "TD-DFT/TDA EXCITED STATES" in line or "TD-DFT EXCITED STATES" in line or "ABSORPTION SPECTRUM" in line:
            phase = "TDDFT"
    p.scf_iterations = scf
    p.opt_cycles = [cycles[k] for k in sorted(cycles)]
    p.last_energy = last_energy
    if "ORCA TERMINATED NORMALLY" in text:
        p.phase = "DONE"
        p.converged = p.converged or not cycles
    else:
        p.phase = phase
    return p
