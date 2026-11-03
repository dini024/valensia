"""Local agent: backend hanya-Docker di 127.0.0.1 untuk Docker Desktop (MacBook)."""
import os, secrets, sys
os.environ.setdefault("BACKENDS", "local")
os.environ.setdefault("DATA_DIR", os.path.expanduser("~/compchem-agent-data"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
if not os.getenv("API_TOKEN"):
    os.environ["API_TOKEN"] = secrets.token_urlsafe(16)
    print("API token (tempel di Dashboard):", os.environ["API_TOKEN"])
import uvicorn
from backend.app.main import app
uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8765")))
