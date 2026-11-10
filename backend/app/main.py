"""ORCA Workbench backend (FastAPI)."""
import base64, binascii, hmac, time, collections
from typing import Dict
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, FileResponse, JSONResponse

from . import config, store
from .models import JobCreate, EmbedRequest, StatusUpdate
from .adapters.local_docker import LocalDockerAdapter
from .adapters.local_agent import LocalAgentAdapter
from .adapters.slurm_brin import SlurmBrinAdapter as SlurmAdapter
from .adapters.fake import FakeAdapter
from .adapters.runner import Runner

app = FastAPI(title="ORCA Workbench API", version=config.VERSION)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["*"], allow_credentials=False)

ADAPTERS: Dict[str, object] = {
    "local_docker": FakeAdapter("local_docker") if config.FAKE_ADAPTER else Runner(LocalDockerAdapter(), "local_docker"),
    "local_agent": LocalAgentAdapter(),
    "slurm_brin": Runner(SlurmAdapter(), "slurm_brin"),
}


def _eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def require_key(x_api_key: str = Header(default="")):
    if config.API_KEY and not _eq(x_api_key, config.API_KEY):
        raise HTTPException(401, "API key salah atau tidak ada (header X-API-Key)")


def require_agent(x_agent_token: str = Header(default="")):
    if not config.AGENT_TOKEN or not _eq(x_agent_token, config.AGENT_TOKEN):
        raise HTTPException(401, "agent token salah / belum diset (header X-Agent-Token)")


_hits = collections.defaultdict(collections.deque)


def rate_limit(request: Request):
    ip = request.client.host if request.client else "?"
    q = _hits[ip]; now = time.time()
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= config.RATE_LIMIT_PER_MIN:
        raise HTTPException(429, "terlalu banyak permintaan")
    q.append(now)


def _public(m: dict) -> dict:
    keys = ("id", "name", "backend", "status", "created", "started", "finished", "nprocs", "message", "input_name")
    d = {k: m.get(k) for k in keys}
    d["files"] = store.files(m["id"])
    return d


def _get(job_id: str) -> dict:
    m = store.load(job_id)
    if not m:
        raise HTTPException(404, "job tidak ditemukan")
    return m


@app.get("/api/health")
def health():
    ad = {}
    for k in ("local_docker", "slurm_brin"):
        ok, detail = ADAPTERS[k].available()
        ad[k] = {"available": bool(ok), "detail": detail}
    try:
        import rdkit  # noqa
        rd = True
    except Exception:
        rd = False
    return {"status": "ok", "version": config.VERSION, "adapters": ad, "rdkit": rd,
            "auth_required": bool(config.API_KEY)}


@app.post("/api/jobs", dependencies=[Depends(require_key), Depends(rate_limit)])
def create_job(req: JobCreate):
    if len(req.input_text.encode()) > config.MAX_INPUT_BYTES:
        raise HTTPException(413, "input terlalu besar")
    if req.nprocs > config.MAX_NPROCS:
        raise HTTPException(422, f"nprocs maksimum {config.MAX_NPROCS}")
    if req.memory_mb > config.MAX_MEMORY_MB:
        raise HTTPException(422, f"memory_mb maksimum {config.MAX_MEMORY_MB}")
    if len(req.extra_files) > config.MAX_EXTRA_FILES:
        raise HTTPException(422, "terlalu banyak extra_files")
    if store.active_count() >= config.MAX_ACTIVE_JOBS:
        raise HTTPException(429, "antrean penuh (MAX_ACTIVE_JOBS)")
    extras, total = [], 0
    for ef in req.extra_files:
        try:
            raw = base64.b64decode(ef.content_b64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(422, f"base64 tidak valid: {ef.name}")
        total += len(raw)
        if total > config.MAX_EXTRA_BYTES:
            raise HTTPException(413, "extra_files terlalu besar")
        if ef.name == req.input_name:
            raise HTTPException(422, "extra file bentrok dengan input")
        extras.append((ef.name, raw))
    ad = ADAPTERS[req.backend]
    if req.backend == "slurm_brin":
        if not (config.BRIN_HOST and config.BRIN_USER and config.BRIN_WORKDIR):
            raise HTTPException(503, "slurm_brin belum dikonfigurasi (BRIN_HOST/BRIN_USER/BRIN_WORKDIR)")
    else:
        ok, detail = ad.available()
        if not ok:
            raise HTTPException(503, f"backend {req.backend} tidak tersedia: {detail}")
    image = req.orca_image or config.ORCA_IMAGE
    meta = store.create({"backend": req.backend, "name": req.name, "input_name": req.input_name,
                         "nprocs": req.nprocs, "memory_mb": req.memory_mb, "walltime": req.walltime,
                         "orca_image": image})
    d = store.job_dir(meta["id"])
    (d / req.input_name).write_text(req.input_text)
    for n, raw in extras:
        (d / n).write_bytes(raw)
    ad.submit(meta)
    return {"id": meta["id"], "status": store.load(meta["id"])["status"]}


@app.get("/api/jobs", dependencies=[Depends(require_key)])
def list_jobs():
    out = []
    for m in store.list_all():
        out.append(_public(ADAPTERS[m["backend"]].refresh(m)))
    return out


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_key)])
def get_job(job_id: str):
    m = _get(job_id)
    return _public(ADAPTERS[m["backend"]].refresh(m))


@app.get("/api/jobs/{job_id}/log", dependencies=[Depends(require_key)], response_class=PlainTextResponse)
def get_log(job_id: str, tail: int = Query(200, ge=1, le=20000)):
    m = _get(job_id)
    p = store.file_path(job_id, m["input_name"][:-4] + ".out")
    if not p:
        return PlainTextResponse("", headers={"X-Job-Status": m["status"]})
    return PlainTextResponse(store.tail_text(p, tail), headers={"X-Job-Status": m["status"]})


@app.get("/api/jobs/{job_id}/files/{name}", dependencies=[Depends(require_key)])
def get_file(job_id: str, name: str):
    _get(job_id)
    p = store.file_path(job_id, name)
    if not p:
        raise HTTPException(404, "berkas tidak ada")
    return FileResponse(p, filename=name, media_type="application/octet-stream")


@app.post("/api/jobs/{job_id}/cancel", dependencies=[Depends(require_key)])
def cancel(job_id: str):
    m = _get(job_id)
    if m["status"] in ("queued", "running"):
        ADAPTERS[m["backend"]].cancel(m)
        if m["backend"] in ("local_agent",) or m["status"] == "queued":
            store.update(job_id, status="cancelled", finished=time.time(), message="dibatalkan")
    return _public(store.load(job_id))


@app.delete("/api/jobs/{job_id}", dependencies=[Depends(require_key)])
def delete_job(job_id: str):
    m = _get(job_id)
    if m["status"] in ("queued", "running"):
        raise HTTPException(409, "batalkan job dulu sebelum menghapus")
    store.delete(job_id)
    return {"deleted": job_id}


@app.post("/api/molecule/embed", dependencies=[Depends(require_key), Depends(rate_limit)])
def embed(req: EmbedRequest):
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, rdMolDescriptors
    except Exception:
        raise HTTPException(501, "RDKit tidak terpasang di backend (pip install rdkit)")
    mol = Chem.MolFromSmiles(req.smiles)
    if mol is None:
        raise HTTPException(422, "SMILES tidak valid")
    mol = Chem.AddHs(mol)
    if mol.GetNumAtoms() > 300:
        raise HTTPException(422, "molekul terlalu besar (>300 atom)")
    p = AllChem.ETKDGv3(); p.randomSeed = req.seed
    if AllChem.EmbedMolecule(mol, p) != 0:
        p.useRandomCoords = True
        if AllChem.EmbedMolecule(mol, p) != 0:
            raise HTTPException(422, "embedding 3D gagal")
    energy = None
    if req.ff == "MMFF94" and AllChem.MMFFHasAllMoleculeParams(mol):
        AllChem.MMFFOptimizeMolecule(mol, maxIters=2000)
        props = AllChem.MMFFGetMoleculeProperties(mol)
        energy = AllChem.MMFFGetMoleculeForceField(mol, props).CalcEnergy()
    else:
        AllChem.UFFOptimizeMolecule(mol, maxIters=2000)
        energy = AllChem.UFFGetMoleculeForceField(mol).CalcEnergy()
    conf = mol.GetConformer()
    lines = [str(mol.GetNumAtoms()), f"RDKit ETKDGv3 + {req.ff if energy is not None else 'UFF'}"]
    for a in mol.GetAtoms():
        q = conf.GetAtomPosition(a.GetIdx())
        lines.append(f"{a.GetSymbol():2s} {q.x:12.6f} {q.y:12.6f} {q.z:12.6f}")
    return {"xyz": "\n".join(lines) + "\n", "energy": energy, "energy_unit": "kcal/mol",
            "formula": rdMolDescriptors.CalcMolFormula(mol), "n_atoms": mol.GetNumAtoms()}


# ----------------------------- agent (antrean MacBook) -----------------------------
@app.post("/api/agent/claim", dependencies=[Depends(require_agent)])
def agent_claim():
    for m in reversed(store.list_all()):  # tertua dulu
        if m["backend"] == "local_agent" and m["status"] == "queued":
            store.update(m["id"], status="running", started=time.time(), message="diklaim agen")
            d = store.job_dir(m["id"])
            extras = [{"name": f["name"], "content_b64": base64.b64encode((d / f["name"]).read_bytes()).decode()}
                      for f in store.files(m["id"]) if f["name"] != m["input_name"]]
            return {"job": {**_public(m), "input_text": (d / m["input_name"]).read_text(),
                            "memory_mb": m["memory_mb"], "walltime": m["walltime"],
                            "orca_image": m.get("orca_image"), "extra_files": extras}}
    return {"job": None}


@app.post("/api/agent/{job_id}/status", dependencies=[Depends(require_agent)])
def agent_status(job_id: str, body: StatusUpdate):
    m = _get(job_id)
    if m["backend"] != "local_agent":
        raise HTTPException(400, "bukan job local_agent")
    if m["status"] == "cancelled":
        return {"status": "cancelled"}          # agen harus menghentikan job
    kw = {"status": body.status, "message": body.message}
    if body.status in ("done", "failed", "cancelled"):
        kw["finished"] = time.time()
    store.update(job_id, **kw)
    return {"status": body.status}


@app.get("/api/agent/{job_id}/state", dependencies=[Depends(require_agent)])
def agent_state(job_id: str):
    return {"status": _get(job_id)["status"]}


@app.post("/api/agent/{job_id}/log", dependencies=[Depends(require_agent)])
async def agent_log(job_id: str, request: Request, append: int = 0):
    m = _get(job_id)
    data = await request.body()
    if len(data) > 50_000_000:
        raise HTTPException(413, "terlalu besar")
    p = store.job_dir(job_id) / (m["input_name"][:-4] + ".out")
    with open(p, "ab" if append else "wb") as f:
        f.write(data)
    return {"bytes": len(data)}


@app.post("/api/agent/{job_id}/file", dependencies=[Depends(require_agent)])
async def agent_file(job_id: str, request: Request, name: str):
    _get(job_id)
    if not store.SAFE_FILE.match(name) or name in store.HIDDEN:
        raise HTTPException(422, "nama berkas tidak valid")
    data = await request.body()
    if len(data) > 500_000_000:
        raise HTTPException(413, "terlalu besar")
    (store.job_dir(job_id) / name).write_bytes(data)
    return {"name": name, "size": len(data)}
