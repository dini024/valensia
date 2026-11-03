# CompChem Lab

Situs statis (GitHub Pages) + backend opsional untuk menjalankan ORCA.

```
index.html  course.html  molecular-builder.html  input-builder.html
results-analyzer.html  orca-docker.html
assets/{css,js}      backend/ (FastAPI)      local-agent/ (Docker Desktop MacBook)
```

## 1. Deploy situs (GitHub Pages)
1. Salin seluruh isi folder ini (kecuali `backend/` dan `local-agent/` jika tak ingin dipublikasikan) ke repository.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Halaman 1-4 berjalan penuh di browser (tanpa backend). Hanya `orca-docker.html` memerlukan backend untuk mengirim job.

## 2. Local agent (Docker Desktop, MacBook)
```bash
./local-agent/install.sh
ORCA_IMAGE=<image-orca-anda> .venv/bin/python local-agent/agent.py
```
- Agent mencetak token. Buka Dashboard → isi URL `http://127.0.0.1:8765` dan token → Simpan & tes.
- ORCA tidak disertakan (lisensi). Anda harus menyediakan image Docker yang berisi ORCA; perintah di dalam container: `$(which orca) <input> > <nama>.out`. Sesuaikan `adapters.py` bila image Anda berbeda.
- Apple Silicon: image ORCA biasanya `linux/amd64`; set `DOCKER_PLATFORM=linux/amd64` (berjalan lewat emulasi, lambat).
- Safari memblokir akses dari halaman https ke `http://127.0.0.1`; gunakan Chrome/Firefox, atau jalankan situs lokal (`python3 -m http.server 8000`) dan ubah `ALLOWED_ORIGINS`.

## 3. Backend untuk HPC BRIN (SLURM)
```bash
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # lalu edit, dan `export $(cat backend/.env | xargs)`
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
Dua mode:
- **Di login node**: kosongkan `SLURM_SSH_HOST`; backend memanggil `sbatch/squeue/sacct` langsung.
- **Dari laptop/server lain**: isi `SLURM_SSH_HOST` (alias di `~/.ssh/config`, kunci SSH tanpa password). Butuh `ssh` dan `rsync`.
Atur `SLURM_REMOTE_ROOT` (default `/mgpfs/home/dini024/ccjobs`), `SLURM_PARTITION`, dan `SLURM_SETUP` (baris `module load ...` untuk ORCA di Trembesi; nama modul harus Anda sesuaikan).

Mengekspos backend ke internet: gunakan HTTPS (reverse proxy atau tunnel), `API_TOKEN` yang panjang, dan `ALLOWED_ORIGINS` yang hanya berisi domain Pages Anda.

## 4. API
`GET /api/health`, `POST /api/jobs` (form: `name, backend, nprocs, main, files[]`), `GET /api/jobs`, `GET /api/jobs/{id}`, `/files`, `/files/{nama}`, `/log`, `POST /api/jobs/{id}/cancel`. Semua memakai `Authorization: Bearer <token>`.

## 5. Batasan yang diketahui
- Backend hanya mendukung ORCA; Gaussian belum.
- Status job lokal hilang jika agent restart saat job berjalan.
- Parser tabel docking di `analyzer.js` heuristik dan belum diuji dengan output ORCA asli.
- Orbital 3D dari molden/cube belum ada di Results Analyzer.
