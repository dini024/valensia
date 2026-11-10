"""Konfigurasi dari environment variable (dibaca ulang setiap load_settings(), mudah dites)."""
import os
from dataclasses import dataclass, field
from pathlib import Path

VERSION = "1.0.0"
ALL_ADAPTERS = ["local-docker", "brin-slurm", "mock", "local-agent"]


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _float(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    data_dir: Path = Path("./data")
    api_token: str = ""
    cors_origins: list = field(default_factory=lambda: ["*"])
    enabled_adapters: list = field(default_factory=lambda: list(ALL_ADAPTERS))
    max_workers: int = 6
    poll_interval: float = 2.0
    max_file_bytes: int = 2 * 1024 * 1024
    max_total_bytes: int = 10 * 1024 * 1024
    # docker
    docker_bin: str = "docker"
    docker_platform: str = ""          # mis. linux/amd64 (Apple Silicon -> emulasi, lambat)
    docker_user: str = "auto"          # auto | "" | "uid:gid"
    orca_image: str = "qcl/orca:latest"
    orca_cmd: str = "/opt/orca/orca"   # HARUS path lengkap agar ORCA bisa memanggil mpirun
    gaussian_image: str = "qcl/gaussian:latest"
    gaussian_cmd: str = "g16"
    local_docker_concurrency: int = 1
    # BRIN / SLURM
    brin_host: str = ""
    brin_user: str = ""
    brin_key: str = ""
    brin_port: int = 22
    brin_remote_base: str = "~/qcl-jobs"
    brin_partition: str = ""
    brin_account: str = ""
    brin_modules: str = ""             # dipisah koma, mis. "openmpi/4.1.5,orca/5.0.4"
    brin_orca_bin: str = ""            # path lengkap orca di cluster
    brin_gaussian_cmd: str = "g16"
    brin_fetch_exclude: str = "*.tmp,*.tmp.*,*.densities,*.ges,*.cis"
    # mock
    mock_delay: float = 4.0


def load_settings() -> Settings:
    e = os.environ
    cors = [o.strip() for o in e.get("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
    ad = [a.strip() for a in e.get("ENABLED_ADAPTERS", ",".join(ALL_ADAPTERS)).split(",") if a.strip()]
    return Settings(
        data_dir=Path(e.get("DATA_DIR", "./data")).expanduser(),
        api_token=e.get("API_TOKEN", ""),
        cors_origins=cors, enabled_adapters=ad,
        max_workers=_int("MAX_WORKERS", 6), poll_interval=_float("POLL_INTERVAL", 2.0),
        max_file_bytes=_int("MAX_FILE_BYTES", 2 * 1024 * 1024),
        max_total_bytes=_int("MAX_TOTAL_BYTES", 10 * 1024 * 1024),
        docker_bin=e.get("DOCKER_BIN", "docker"), docker_platform=e.get("DOCKER_PLATFORM", ""),
        docker_user=e.get("DOCKER_USER", "auto"),
        orca_image=e.get("ORCA_IMAGE", "qcl/orca:latest"), orca_cmd=e.get("ORCA_CMD", "/opt/orca/orca"),
        gaussian_image=e.get("GAUSSIAN_IMAGE", "qcl/gaussian:latest"), gaussian_cmd=e.get("GAUSSIAN_CMD", "g16"),
        local_docker_concurrency=_int("LOCAL_DOCKER_CONCURRENCY", 1),
        brin_host=e.get("BRIN_HOST", ""), brin_user=e.get("BRIN_USER", ""), brin_key=e.get("BRIN_KEY", ""),
        brin_port=_int("BRIN_PORT", 22), brin_remote_base=e.get("BRIN_REMOTE_BASE", "~/qcl-jobs"),
        brin_partition=e.get("BRIN_PARTITION", ""), brin_account=e.get("BRIN_ACCOUNT", ""),
        brin_modules=e.get("BRIN_MODULES", ""), brin_orca_bin=e.get("BRIN_ORCA_BIN", ""),
        brin_gaussian_cmd=e.get("BRIN_GAUSSIAN_CMD", "g16"),
        brin_fetch_exclude=e.get("BRIN_FETCH_EXCLUDE", "*.tmp,*.tmp.*,*.densities,*.ges,*.cis"),
        mock_delay=_float("MOCK_DELAY", 4.0),
    )


# ---- konstanta tingkat-modul (dibaca saat impor; dipakai main.py) ----
_e = os.environ


def _flag(name, default=False):
    v = _e.get(name)
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


API_KEY = _e.get("API_KEY", _e.get("API_TOKEN", ""))
AGENT_TOKEN = _e.get("AGENT_TOKEN", "")
CORS_ORIGINS = [o.strip() for o in _e.get("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
FAKE_ADAPTER = _flag("FAKE_ADAPTER")
DATA_DIR = Path(_e.get("DATA_DIR", "./data")).expanduser()
MAX_ACTIVE_JOBS = _int("MAX_ACTIVE_JOBS", 8)
MAX_NPROCS = _int("MAX_NPROCS", 64)
MAX_MEMORY_MB = _int("MAX_MEMORY_MB", 256000)
MAX_EXTRA_FILES = _int("MAX_EXTRA_FILES", 10)
MAX_EXTRA_BYTES = _int("MAX_EXTRA_BYTES", 20 * 1024 * 1024)
MAX_INPUT_BYTES = _int("MAX_INPUT_BYTES", 2 * 1024 * 1024)
RATE_LIMIT_PER_MIN = _int("RATE_LIMIT_PER_MIN", 240)
ORCA_IMAGE = _e.get("ORCA_IMAGE", "qcl/orca:latest")
BRIN_HOST = _e.get("BRIN_HOST", "")
BRIN_USER = _e.get("BRIN_USER", "")
BRIN_WORKDIR = _e.get("BRIN_WORKDIR", _e.get("BRIN_REMOTE_BASE", "~/qcl-jobs"))
