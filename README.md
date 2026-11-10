# Quantum Chemistry Lab — modul DFT, builder, input, analisis hasil (GitHub Pages)

Situs statis (HTML/CSS/JS, **tanpa build step**) untuk belajar DFT, membangun molekul, menyiapkan input ORCA/Gaussian,
menganalisis hasil, dan (opsional) menjalankan ORCA lewat Docker/HPC. Semua pustaka pihak ketiga (RDKit.js, 3Dmol.js)
sudah disertakan di `assets/vendor/` sehingga situs bekerja tanpa CDN.

| Berkas | Isi |
|---|---|
| `index.html` | Dashboard utama |
| `course.html` | Modul kuliah interaktif: komputasi vs eksperimen (dengan rujukan paper), Schrödinger, mengapa banyak-elektron sulit, Hohenberg–Kohn, Kohn–Sham & siklus **SCF** (grafik konvergensi), basis set, tangga Jacob, biaya komputasi, PES/frekuensi, TDDFT, kuis |
| `molecular-builder.html` | SMILES/pustaka/PubChem → 2D + deskriptor, seri substituen, 3D + pre-optimize (konformer), ekspor XYZ/SDF, lanjut ke Input Builder |
| `input-builder.html` | Input ORCA & Gaussian (Opt/Freq/TDDFT/scan/TS, solvasi, SCF, molden/fchk), batch, skrip SLURM/Docker |
| `results-analyzer.html` | Parser ORCA/Gaussian: geometri, frekuensi, properti molekul, orbital 3D (molden/fchk/cube), level energi, parameter elektrokimia, TDDFT, panel DSSC |
| `orca-docker.html` | ORCA Docker Workbench (mode demo, backend lokal, agen, SLURM BRIN) |
| `backend/` | FastAPI + adapter Docker lokal, agen MacBook (antrean), HPC BRIN SLURM (SSH) |
| `local-agent/` | Agen untuk Docker Desktop di MacBook (`serve` atau `poll`) |
| `assets/` | `css/`, `js/` (aplikasi), `vendor/` (RDKit.js, 3Dmol.js) |
| `samples/` | Contoh keluaran ORCA/Gaussian dan molden untuk mencoba Analyzer |

## 1. Deploy ke GitHub Pages

1. Salin seluruh isi folder ini ke repositori Anda (mis. `quantum-chemistry-lab`). Berkas `.nojekyll` sudah ada.
2. GitHub → *Settings → Pages* → *Source*: `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Buka `https://USERNAME.github.io/REPO/`. Uji lokal: `python3 -m http.server 8000` lalu buka `http://localhost:8000`.

> Ukuran `assets/vendor/` ±10 MB (WASM RDKit). Jika mau, Anda boleh menghapusnya; `common.js` akan jatuh ke CDN jsDelivr.
> Folder `backend/` dan `local-agent/` tidak dijalankan oleh Pages (hanya ikut tersimpan di repositori).

## 2. Alur kerja

`Molecular Builder` (Generate 3D + pre-optimize) → tombol **Lanjut → ORCA/Gaussian input** → `Input Builder` → jalankan job
(ORCA Docker / HPC / lokal) → `Results Analyzer`.

Berkas yang perlu diunggah ke Analyzer:

| Tujuan | ORCA | Gaussian |
|---|---|---|
| Geometri, frekuensi, energi, TDDFT | `nama.out` | `nama.log` |
| Gambar orbital HOMO/LUMO | `orca_2mkl nama -molden` → `nama.molden.input` | `formchk nama.chk nama.fchk` → `nama.fchk` |

Berkas `.gbw` / `.chk` bersifat biner dan **harus dikonversi** dulu. Beberapa berkas boleh diunggah sekaligus (mis. job opt+freq dan job TDDFT terpisah; hasilnya digabung).
Orbital: dukungan fungsi basis s,p,d,f,g (sferis/Kartesius). Spin-polarized (UKS): orbital alpha/beta tersedia di pemilih.

## 3. Backend (opsional, untuk menjalankan job)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # isi API_KEY, ORCA_IMAGE, dst.
set -a; source .env; set +a
uvicorn app.main:app --host 127.0.0.1 --port 8000
python -m pytest -q           # uji (FAKE_ADAPTER tidak perlu diset manual untuk tes)
```

* **ORCA tidak disertakan** (lisensi). Bangun image pribadi: `backend/orca-image/Dockerfile` (butuh arsip ORCA hasil unduhan Anda).
* **Local Docker**: backend memanggil `docker run` (argumen disusun sebagai argv, bukan string shell). Di Apple Silicon set `DOCKER_PLATFORM=linux/amd64` (emulasi, lambat).
* **HPC BRIN (SLURM)**: isi `BRIN_HOST`, `BRIN_USER`, `BRIN_KEY`, `BRIN_ORCA_BIN`, `BRIN_MODULES`, `BRIN_PARTITION`. Backend membuat skrip `sbatch`, mengunggah lewat `scp`, memantau dengan `squeue/sacct`, lalu mengunduh hasil. Nama modul/partisi **harus disesuaikan** dengan kebijakan klaster Anda.
* **Agen MacBook (`local-agent/`)**: `python agent.py serve --origin https://USERNAME.github.io --api-key RAHASIA` (halaman Pages langsung memanggil `127.0.0.1:8765`), atau `python agent.py poll --backend URL --token TOKEN` (hanya koneksi keluar).
* **Keamanan**: halaman Pages (HTTPS) hanya bisa memanggil backend HTTPS atau `http://127.0.0.1`. Jangan membuka backend ke internet tanpa `API_KEY` kuat + reverse proxy HTTPS + `CORS_ORIGINS` yang dibatasi. Jangan memasang `docker.sock` ke container kecuali sadar risikonya (setara akses root).

Di `orca-docker.html`, **Mode demo** (default) mensimulasikan job di browser dengan keluaran contoh; matikan untuk memakai backend nyata dan isi URL + API key.

## 4. Catatan ilmiah / batasan

* Modul kuliah memakai **model mainan 1D** untuk visualisasi (dua elektron, siklus SCF, kerapatan) — dimaksudkan untuk intuisi, bukan hasil DFT nyata; ini dinyatakan di halaman.
* Pre-optimize 3D di browser memakai force field ringan (UFF-lite) — energi relatif, bukan energi DFT. Selalu optimasi ulang dengan DFT.
* IP/EA Koopmans dari HOMO/LUMO Kohn–Sham adalah aproksimasi; gunakan ΔSCF (disediakan) untuk nilai yang lebih bermakna.
* Panel DSSC adalah estimasi level-energi molekul tunggal (nilai E<sub>CB</sub> TiO₂ dan potensial redoks dapat diubah), bukan prediksi efisiensi.
* Preset input adalah titik awal umum; periksa sintaks terhadap manual ORCA/Gaussian versi Anda.

## 5. Pengembangan

Tidak ada langkah build. Struktur JS: `common.js` (util, nav, tema, viewer), `plot.js` (grafik SVG), `parsers.js` (ORCA/Gaussian), `analysis.js` (geometri, deskriptor, spektrum), `orbitals.js` (molden/fchk → cube), `inputbuilder.js`, `molbuilder*.js`, `docker.js`, `results.js`, `course*.js`.
Parser dan analisis juga bisa dipakai di Node: `node -e "const P=require('./assets/js/parsers.js');console.log(P.parse(require('fs').readFileSync('samples/orca_opt_freq.out','utf8')).formula)"`.

## Referensi utama (modul kuliah)

Daftar lengkap dengan tautan ada di bagian 0 dan akhir `course.html` (Hohenberg & Kohn 1964; Kohn & Sham 1965; Becke 1993; Lejaeghere dkk., *Science* 2016; Jain dkk., *APL Mater.* 2013; Mardirossian & Head-Gordon 2017; dll.).
