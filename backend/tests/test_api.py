import base64, os, time, importlib, sys
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path)); monkeypatch.setenv("FAKE_ADAPTER", "1")
    monkeypatch.setenv("API_KEY", "k"); monkeypatch.setenv("AGENT_TOKEN", "tok")
    for m in [m for m in sys.modules if m.startswith("app")]:
        del sys.modules[m]
    from app import main
    return TestClient(main.app)

H = {"X-API-Key": "k"}; A = {"X-Agent-Token": "tok"}
BODY = {"backend": "local_docker", "name": "h2o", "input_name": "job.inp", "input_text": "! HF\n* xyz 0 1\nO 0 0 0\n*\n", "nprocs": 1}


def wait(client, jid, want, t=15):
    for _ in range(int(t / 0.2)):
        s = client.get(f"/api/jobs/{jid}", headers=H).json()
        if s["status"] in want: return s
        time.sleep(0.2)
    raise AssertionError(s)


def test_health_and_auth(client):
    r = client.get("/api/health"); assert r.status_code == 200 and r.json()["status"] == "ok"
    assert client.get("/api/jobs").status_code == 401
    assert client.get("/api/jobs", headers=H).json() == []


def test_job_lifecycle(client):
    r = client.post("/api/jobs", json=BODY, headers=H); assert r.status_code == 200, r.text
    jid = r.json()["id"]
    s = wait(client, jid, {"done"})
    assert any(f["name"] == "job.out" for f in s["files"])
    log = client.get(f"/api/jobs/{jid}/log?tail=5", headers=H)
    assert log.status_code == 200 and "ORCA TERMINATED NORMALLY" in log.text
    f = client.get(f"/api/jobs/{jid}/files/job.out", headers=H); assert f.status_code == 200
    assert client.delete(f"/api/jobs/{jid}", headers=H).json()["deleted"] == jid
    assert client.get(f"/api/jobs/{jid}", headers=H).status_code == 404


def test_validation_and_traversal(client):
    bad = dict(BODY, input_name="../x.inp"); assert client.post("/api/jobs", json=bad, headers=H).status_code == 422
    bad = dict(BODY, nprocs=999); assert client.post("/api/jobs", json=bad, headers=H).status_code == 422
    bad = dict(BODY, walltime="abc"); assert client.post("/api/jobs", json=bad, headers=H).status_code == 422
    bad = dict(BODY, extra_files=[{"name": "../../etc", "content_b64": "AA=="}]); assert client.post("/api/jobs", json=bad, headers=H).status_code == 422
    jid = client.post("/api/jobs", json=BODY, headers=H).json()["id"]
    assert client.get(f"/api/jobs/{jid}/files/..%2Fjob.json", headers=H).status_code in (404, 422)
    assert client.get(f"/api/jobs/{jid}/files/job.json", headers=H).status_code == 404
    assert client.get("/api/jobs/not-an-id", headers=H).status_code == 404


def test_extra_files_and_cancel(client):
    b = dict(BODY, extra_files=[{"name": "geom.xyz", "content_b64": base64.b64encode(b"1\n\nH 0 0 0\n").decode()}])
    jid = client.post("/api/jobs", json=b, headers=H).json()["id"]
    assert client.post(f"/api/jobs/{jid}/cancel", headers=H).status_code == 200
    s = wait(client, jid, {"cancelled", "done"}); assert s["status"] in ("cancelled", "done")


def test_agent_queue(client):
    jid = client.post("/api/jobs", json=dict(BODY, backend="local_agent"), headers=H).json()["id"]
    assert client.post("/api/agent/claim").status_code == 401
    c = client.post("/api/agent/claim", headers=A).json()["job"]
    assert c["id"] == jid and "HF" in c["input_text"]
    assert client.post("/api/agent/claim", headers=A).json()["job"] is None
    client.post(f"/api/agent/{jid}/log?append=0", content=b"hello\nORCA TERMINATED NORMALLY\n", headers=A)
    client.post(f"/api/agent/{jid}/file?name=job.gbw", content=b"\x00\x01", headers=A)
    client.post(f"/api/agent/{jid}/status", json={"status": "done", "message": "ok"}, headers=A)
    s = client.get(f"/api/jobs/{jid}", headers=H).json()
    assert s["status"] == "done" and {f["name"] for f in s["files"]} == {"job.inp", "job.out", "job.gbw"}


def test_slurm_unconfigured(client):
    r = client.post("/api/jobs", json=dict(BODY, backend="slurm_brin"), headers=H)
    assert r.status_code == 503


def test_sbatch_script(client):
    from app.adapters.slurm_brin import sbatch_script
    s = sbatch_script({"name": "x", "input_name": "job.inp", "nprocs": 4, "memory_mb": 2000, "walltime": "01:00:00"}, "/w/1")
    assert "--ntasks=4" in s and "job.inp" in s and "TODO" in s


def test_embed(client):
    r = client.post("/api/molecule/embed", json={"smiles": "CCO"}, headers=H)
    assert r.status_code in (200, 501)
    if r.status_code == 200:
        assert r.json()["n_atoms"] == 9
    assert client.post("/api/molecule/embed", json={"smiles": "C(("}, headers=H).status_code in (422, 501)
