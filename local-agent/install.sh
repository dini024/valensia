#!/bin/bash
set -e
cd "$(dirname "$0")/.."
docker info >/dev/null 2>&1 || { echo "Docker Desktop belum berjalan"; exit 1; }
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
echo "Jalankan: ORCA_IMAGE=<image-orca-anda> .venv/bin/python local-agent/agent.py"
