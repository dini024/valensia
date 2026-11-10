# Backend ORCA Workbench (FastAPI)

Menerima input ORCA dari halaman `orca-docker.html` (GitHub Pages) dan menjalankannya lewat tiga jalur:

| backend | cara kerja |
|---|---|
| `local_docker` | backend memanggil `docker run` di mesin yang sama |
| `local_agent` | job diantrekan; `local-agent/agent.py poll` di MacBook mengambilnya (outbound-only) |
| `slurm_brin` | `scp` + `sbatch` lewat SSH ke cluster HPC (parameter cluster Anda isi sendiri) |

> **ORCA tidak disertakan.** ORCA berlisensi (gratis akademik via ORCA forum, tidak boleh didistribusikan ulang). Bangun image Docker **pribadi** dari unduhan ORCA Anda (lihat `local-agent/README.md`) dan isi `ORCA_IMAGE`. Nilai bawaan `your-orca-image:tag` hanyalah placeholder.

## Menjalankan (lokal)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # isi API_KEY, AGENT_TOKEN, CORS_ORIGINS, ORCA_IMAGE
set -a; source .env; set +a
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Uji tanpa Docker/ORCA: `FAKE_ADAPTER=1 uvicorn app.main:app` (menghasilkan keluaran ORCA **simulasi**).
Tes otomatis: `pytest -q`. Dokumentasi interaktif: `http://127.0.0.1:8000/docs`.

## API ringkas
`GET /api/health` · `POST /api/jobs` · `GET /api/jobs` · `GET /api/jobs/{id}` · `GET /api/jobs/{id}/log?tail=N` ·
`GET /api/jobs/{id}/files/{name}` · `POST /api/jobs/{id}/cancel` · `DELETE /api/jobs/{id}` ·
`POST /api/molecule/embed` (RDKit penuh: ETKDGv3 + MMFF94/UFF; 501 bila RDKit tak terpasang).
Header `X-API-Key` wajib bila `API_KEY` diset. Endpoint agen: `/api/agent/*` dengan `X-Agent-Token`.

## Catatan ORCA paralel
ORCA memanggil `mpirun` sendiri dan harus dipanggil dengan **path absolut**. Adapter memakai `$(which orca)` di dalam container/job. Pastikan `%pal nprocs N end` di input = `nprocs` job, dan `%maxcore` (MB per core) × N ≤ memori yang diminta.

## Keamanan — baca sebelum membuka ke internet
- Backend **mengeksekusi input yang dikirim pengguna**. Input ORCA dapat menjalankan perintah (`! ... ` + blok `%` tertentu seperti `%method`/ekstern, `System`-style invoke melalui skrip). Perlakukan API key sebagai kunci akses ke mesin Anda.
- **Selalu set `API_KEY`**; jalankan di `127.0.0.1` atau di belakang reverse proxy HTTPS (Caddy/nginx). Halaman GitHub Pages memakai HTTPS, sehingga backend publik juga harus HTTPS (mixed content diblokir). Untuk lokal: Chrome/Firefox mengizinkan `http://localhost`, **Safari tidak**.
- Batasi `CORS_ORIGINS` ke origin Pages Anda (`https://USERNAME.github.io`), jangan `*` di produksi.
- Kontainer dijalankan dengan `--network none`, `--cpus`, `--memory`. Batas: `MAX_INPUT_BYTES`, `MAX_NPROCS`, `MAX_MEMORY_MB`, `MAX_ACTIVE_JOBS`, `RATE_LIMIT_PER_MIN` (rate limiter in-memory per IP).
- Nama berkas divalidasi (`[A-Za-z0-9_.-]`), tidak ada traversal; tidak ada `shell=True` di sisi host.
- Mengakses `docker.sock` dari container backend = akses root-setara. Lebih aman: jalankan backend di host, atau pakai `local_agent`.
- Jangan menyimpan kunci SSH di repo. Untuk Slurm pakai kunci khusus dengan hak minimal.

## Slurm / HPC BRIN
`app/adapters/slurm_brin.py` memakai perintah Slurm standar. **Nama partisi, modul, jalur kerja, dan aturan akun tidak diketahui kode ini**; isi `BRIN_*` di `.env` dari dokumentasi resmi atau admin cluster (baris bertanda `TODO`). Cek manual dulu: `ssh user@host 'module avail orca; sinfo'`.
Alur: buat `job.sbatch` → `scp` ke `BRIN_WORKDIR/<id>` → `sbatch --parsable` → polling `squeue`/`sacct` saat UI meminta status → `scp` hasil (`*.out *.gbw *.xyz ...`) bila selesai. Pastikan kebijakan cluster mengizinkan login SSH otomatis dari mesin backend.

## Docker
`docker compose up --build` menjalankan API di `127.0.0.1:8000`. Lihat komentar di `docker-compose.yml` mengenai `docker.sock` dan SSH key.
