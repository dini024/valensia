import re
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.\-]{0,63}$")
Status = Literal["queued", "running", "done", "failed", "cancelled"]
BackendName = Literal["local_docker", "local_agent", "slurm_brin"]


class ExtraFile(BaseModel):
    name: str
    content_b64: str

    @field_validator("name")
    @classmethod
    def _n(cls, v):
        if not NAME_RE.match(v) or v.startswith("."):
            raise ValueError("nama file tidak valid")
        return v


class JobCreate(BaseModel):
    backend: BackendName = "local_docker"
    name: str = Field(default="job", max_length=64)
    input_name: str = "job.inp"
    input_text: str
    nprocs: int = Field(default=1, ge=1)
    memory_mb: int = Field(default=2000, ge=100)
    walltime: str = "24:00:00"
    orca_image: Optional[str] = None
    extra_files: List[ExtraFile] = []

    @field_validator("input_name")
    @classmethod
    def _in(cls, v):
        if not NAME_RE.match(v) or not v.lower().endswith(".inp"):
            raise ValueError("input_name harus berakhiran .inp dan hanya berisi huruf/angka/_-.")
        return v

    @field_validator("walltime")
    @classmethod
    def _wt(cls, v):
        if not re.match(r"^\d{1,3}:[0-5]\d:[0-5]\d$", v):
            raise ValueError("walltime harus HH:MM:SS")
        return v

    @field_validator("orca_image")
    @classmethod
    def _img(cls, v):
        if v is not None and not re.match(r"^[A-Za-z0-9][A-Za-z0-9_.:/@\-]{0,200}$", v):
            raise ValueError("nama image tidak valid")
        return v


class EmbedRequest(BaseModel):
    smiles: str = Field(max_length=2000)
    ff: Literal["MMFF94", "UFF"] = "MMFF94"
    seed: int = 42


class StatusUpdate(BaseModel):
    status: Status
    message: str = ""
