# Local agent — ORCA di Docker Desktop (MacBook)

Menjembatani halaman `orca-docker.html` (di GitHub Pages) ke Docker Desktop di laptop Anda. Hanya memakai Python 3 standar (+ `requests` untuk mode `poll`).

## 1. Siapkan Docker Desktop
1. Pasang Docker Desktop untuk Mac (Apple Silicon atau Intel). Buka aplikasinya hingga status "running".
2. Settings → Resources: alokasikan CPU & memori sesuai kebutuhan (mis. 6 CPU, 16 GB). Agent hanya bisa memakai sebesar ini.
3. **Apple Silicon:** ORCA untuk Linux dibuat untuk x86-64. Image `linux/amd64` berjalan lewat emulasi Rosetta/QEMU — jauh lebih lambat dan MPI bisa bermasalah. Untuk produksi, lebih baik jalankan di server/HPC x86-64; MacBook cocok untuk uji kecil.

## 2. Bangun image ORCA pribadi (dari unduhan ORCA berlisensi Anda)
ORCA tidak boleh didistribusikan ulang; unduh sendiri dari ORCA forum (akun akademik, setujui lisensi) lalu bangun image **lokal** — jangan push ke registry publik. Contoh kerangka (sesuaikan nama arsip dan versi OpenMPI yang disyaratkan rilis ORCA Anda — baca release notes-nya):

```dockerfile
# Dockerfile.orca  (LOKAL; arsip ORCA diletakkan di sebelah file ini)
FROM --platform=linux/amd64 ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
      openmpi-bin libopenmpi-dev libgomp1 xz-utils ca-certificates && rm -rf /var/lib/apt/lists/*
# TODO: nama arsip & versi sesuai unduhan Anda
COPY orca_<versi>_linux_x86-64_shared_openmpi<ver>.tar.xz /tmp/orca.tar.xz
RUN mkdir /opt/orca && tar -xf /tmp/orca.tar.xz -C /opt/orca --strip-components=1 && rm /tmp/orca.tar.xz
ENV PATH=/opt/orca:$PATH LD_LIBRARY_PATH=/opt/orca:$LD_LIBRARY_PATH OMPI_ALLOW_RUN_AS_ROOT=1 OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1
WORKDIR /work
```
```bash
docker build --platform linux/amd64 -t orca-local:6 -f Dockerfile.orca .
docker run --rm orca-local:6 sh -c 'which orca && ls /opt/orca | head'
export ORCA_IMAGE=orca-local:6
```
ORCA paralel harus dipanggil dengan path absolut — agent memakai `$(which orca)`. Pastikan `%pal nprocs N end` cocok dengan nilai di UI.

## 3. Mode `serve` (langsung dari browser)
```bash
pip install -r requirements.txt     # hanya perlu untuk mode poll
export ORCA_IMAGE=orca-local:6
python agent.py serve --origin https://USERNAME.github.io --api-key RAHASIA
```
Di `orca-docker.html` → Konfigurasi: URL `http://127.0.0.1:8765`, API key sama, backend `local_docker`.
- Server hanya mengikat `127.0.0.1`; CORS hanya untuk `--origin`. Host non-lokal wajib `--api-key`.
- Halaman HTTPS memanggil `http://127.0.0.1`: **Chrome/Firefox** mengizinkan (localhost dianggap secure context). **Safari memblokir** — gunakan Chrome/Firefox atau mode `poll`.
- Chrome baru dapat menanyakan izin "Local Network Access"; izinkan.

## 4. Mode `poll` (outbound-only, tanpa membuka port)
Backend (di server/VPS Anda) memiliki job `local_agent` di antrean. Di MacBook:
```bash
export AGENT_TOKEN=token-yang-sama-dengan-backend
python agent.py poll --backend https://api.contoh.id --interval 10
```
Agent mengklaim job, menjalankan Docker, mengunggah log tiap ~5 detik, lalu `.out/.gbw/.xyz/…` saat selesai.

## 5. Flag sumber daya
Per job: `--cpus N`, `--memory (memory_mb × N + 512) MB`, `--network none`. Batas keras agent: `MAX_NPROCS` (default 8), `MAX_MEMORY_MB` (16000), maksimum 2 job aktif (mode serve). `AGENT_WORKDIR` mengubah folder kerja (default `~/orca-agent-jobs`).

## 6. Jalan otomatis (launchd)
`~/Library/LaunchAgents/id.orca.agent.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>id.orca.agent</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>/Users/ANDA/orca-agent/agent.py</string>
    <string>poll</string><string>--backend</string><string>https://api.contoh.id</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>AGENT_TOKEN</key><string>GANTI</string>
    <key>ORCA_IMAGE</key><string>orca-local:6</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/orca-agent.log</string>
  <key>StandardErrorPath</key><string>/tmp/orca-agent.err</string>
</dict></plist>
```
`launchctl load ~/Library/LaunchAgents/id.orca.agent.plist` (hentikan: `launchctl unload ...`). Docker Desktop harus aktif saat job berjalan.

## Uji
`python tests/test_agent.py` — memakai shim `docker` palsu (tidak butuh Docker).

## Keamanan
Agent menjalankan input yang diterima dari UI/backend di dalam container tanpa jaringan. Tetap: jangan ekspos port 8765 ke jaringan, simpan API key/token di tempat aman, dan hanya jalankan input dari sumber tepercaya.
