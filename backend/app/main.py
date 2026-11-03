import json, os, re, time, uuid
from pathlib import Path
from typing import List
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware
from .adapters import ADAPTERS

DATA = Path(os.getenv("DATA_DIR", "./data")) / "jobs"
DATA.mkdir(parents=True, exist_ok=True)
TOKEN = os.getenv("API_TOKEN", "")
ENABLED = [b.strip() for b in os.getenv("BACKENDS", "local,slurm").split(",")]
ORIGINS = os.getenv("ALLOWED_ORIGINS", "https://dini94.github.io,http://localhost:8000").split(",")
EXT = {".inp", ".xyz", ".pdb", ".sdf", ".mol2", ".txt", ".gbw", ".hess"}
FINAL = {"done", "failed", "cancelled"}

def auth(authorization: str = Header("")):
    if TOKEN and authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "Token salah")

app = FastAPI(title="CompChem Lab API", dependencies=[Depends(auth)])
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

class PNA(BaseHTTPMiddleware):  # Chrome Private Network Access (GitHub Pages -> 127.0.0.1)
    async def dispatch(self, req, call):
        r = await call(req)
        r.headers["Access-Control-Allow-Private-Network"] = "true"
        return r
app.add_middleware(PNA)

def safe(n): return re.sub(r"[^A-Za-z0-9._-]", "_", Path(n).name)
def jd(i):
    d = DATA / i
    if not re.fullmatch(r"[0-9a-f]{32}", i) or not d.is_dir():
        raise HTTPException(404)
    return d
def load(d): return json.loads((d / "meta.json").read_text())
def save(d, m): (d / "meta.json").write_text(json.dumps(m))
def refresh(d):
    m = load(d)
    if m["status"] not in FINAL:
        try:
            m["status"] = ADAPTERS[m["backend"]].status(m, d)
        except Exception as e:
            m["error"] = str(e)
        save(d, m)
    return m

@app.get("/api/health")
def health(): return {"ok": True, "backends": ENABLED}

@app.post("/api/jobs")
async def create(name: str = Form("job"), backend: str = Form("local"), nprocs: int = Form(4),
                 main: str = Form(""), files: List[UploadFile] = File(...)):
    if backend not in ENABLED:
        raise HTTPException(400, "backend tidak aktif")
    names = [safe(f.filename) for f in files]
    if any(Path(n).suffix.lower() not in EXT for n in names):
        raise HTTPException(400, "ekstensi file ditolak")
    main = safe(main) if main else next((n for n in names if n.endswith(".inp")), "")
    if main not in names:
        raise HTTPException(400, "file input utama (.inp) tidak ada")
    i = uuid.uuid4().hex
    d = DATA / i
    d.mkdir()
    for f, n in zip(files, names):
        (d / n).write_bytes(await f.read())
    m = {"id": i, "name": name[:60], "backend": backend, "nprocs": max(1, min(nprocs, 128)),
         "main": main, "status": "queued", "created": time.time()}
    try:
        m.update(ADAPTERS[backend].submit(m, d) or {})
    except Exception as e:
        m["status"], m["error"] = "failed", str(e)
    save(d, m)
    return m

@app.get("/api/jobs")
def jobs(): return sorted([refresh(d) for d in DATA.iterdir() if d.is_dir()], key=lambda m: -m["created"])
@app.get("/api/jobs/{i}")
def job(i: str): return refresh(jd(i))
@app.get("/api/jobs/{i}/files")
def files(i: str): return sorted(p.name for p in jd(i).iterdir() if p.is_file() and p.name != "meta.json" and not p.name.startswith("."))
@app.get("/api/jobs/{i}/files/{n}")
def get_file(i: str, n: str):
    p = jd(i) / safe(n)
    if not p.is_file():
        raise HTTPException(404)
    return FileResponse(p)
@app.get("/api/jobs/{i}/log")
def log(i: str):
    d = jd(i); m = refresh(d); o = d / (Path(m["main"]).stem + ".out")
    return PlainTextResponse(o.read_text(errors="replace")[-20000:] if o.exists() else m.get("error", ""))
@app.post("/api/jobs/{i}/cancel")
def cancel(i: str):
    d = jd(i); m = load(d)
    ADAPTERS[m["backend"]].cancel(m, d)
    m["status"] = "cancelled"; save(d, m)
    return m
