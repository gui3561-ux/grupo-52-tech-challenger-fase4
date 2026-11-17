"""Testes da API HTTP (src/api/): etapas, simulação, detecção, visualização e pipeline.

Cada teste roda num diretório temporário com uma cópia do CSV base: os caminhos de
`src/credit/config.py` são relativos ao diretório corrente, então os artefatos
versionados do projeto (data/, models/, reports/) não são tocados.
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path

import mlflow
import pytest
from fastapi.testclient import TestClient

from src.api.main import create_app
from src.credit import config as C

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TRAINING_STAGES = ("data_split", "model_training")
# Cenário "Sem choque" do client: produção idêntica à Produção-base.
NO_SHOCK = {"credit_inflation": 1.0, "credit_noise_std": 0, "age_shift_years": 0, "checking_distribution": None}


@pytest.fixture
def workdir(tmp_path, monkeypatch):
    raw = tmp_path / C.RAW_CSV
    raw.parent.mkdir(parents=True)
    shutil.copy(PROJECT_ROOT / C.RAW_CSV, raw)
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.fixture
def tracking_uri(workdir):
    return f"sqlite:///{workdir}/mlflow.db"


@pytest.fixture
def client(tracking_uri):
    with TestClient(create_app(tracking_uri=tracking_uri)) as test_client:
        yield test_client


def run_stages(client: TestClient, *stages: str) -> dict[str, dict]:
    results = {}
    for stage in stages:
        response = client.post(f"/pipeline/stages/{stage}/run")
        assert response.status_code == 200, response.text
        results[stage] = response.json()
    return results


def wait_for_job(client: TestClient, job_id: str, timeout: float = 120) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/pipeline/runs/{job_id}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.2)
    pytest.fail(f"Job {job_id} não terminou em {timeout}s")


# --- Etapas -------------------------------------------------------------------


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "busy": False}


def test_list_stages_shows_order_and_missing_prerequisites(client):
    stages = {s["name"]: s for s in client.get("/pipeline/stages").json()}

    assert [s["order"] for s in stages.values()] == list(range(1, 8))
    assert stages["data_validation"]["ready"] is True
    assert stages["model_training"]["ready"] is False
    assert stages["model_training"]["missing"] == [str(C.REFERENCE_CSV)]
    assert stages["drift_detection"]["last_execution"] is None


def test_stage_out_of_order_returns_409_with_stages_to_run_first(client):
    response = client.post("/pipeline/stages/drift_detection/run")

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["run_first"] == ["data_split", "model_training", "drift_simulation"]
    assert str(C.PRODUCTION_CSV) in detail["missing"]


def test_unknown_stage_returns_422(client):
    assert client.post("/pipeline/stages/deploy/run").status_code == 422


def test_run_stages_in_order_and_record_last_execution(client):
    results = run_stages(client, "data_validation", "ingestion_gate", *TRAINING_STAGES)

    assert results["data_validation"]["result"] == {"rows": 5000, "contract": "PASSED"}
    assert results["ingestion_gate"]["result"]["contract_rejected_batches"] == 1
    assert results["data_split"]["result"] == {"reference_rows": 3500, "production_raw_rows": 1500}
    assert results["model_training"]["result"]["roc_auc"] > 0.5

    stages = {s["name"]: s for s in client.get("/pipeline/stages").json()}
    assert stages["model_training"]["last_execution"]["status"] == "succeeded"
    assert stages["drift_simulation"]["ready"] is True


# --- Simulação ----------------------------------------------------------------


def test_simulate_drift_default_applies_official_shock(client):
    run_stages(client, "data_split")

    response = client.post("/drift/simulate")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rows"] == 1500
    numeric = {c["feature"]: c for c in body["numeric_changes"]}
    assert numeric["Credit amount"]["mean_after"] > 1.4 * numeric["Credit amount"]["mean_before"]
    assert numeric["Age"]["mean_after"] < numeric["Age"]["mean_before"] - 8
    checking = body["categorical_changes"][0]
    assert checking["feature"] == "Checking account"
    assert checking["after"]["little"] == pytest.approx(0.45, abs=0.05)


def test_simulate_drift_without_shock_keeps_distributions(client):
    run_stages(client, "data_split")

    body = client.post("/drift/simulate", json=NO_SHOCK).json()

    for change in body["numeric_changes"]:
        assert change["mean_after"] == change["mean_before"]
    assert body["categorical_changes"][0]["after"] == body["categorical_changes"][0]["before"]


@pytest.mark.parametrize(
    "params",
    [{"checking_distribution": {"crypto": 1.0}}, {"checking_distribution": {"little": -1}}, {"credit_inflation": 0}],
)
def test_simulate_drift_rejects_invalid_params(client, params):
    assert client.post("/drift/simulate", json=params).status_code == 422


def test_production_gate_blocks_simulation_that_breaks_contract(client):
    run_stages(client, "data_split")
    # Ruído com desvio 1.0 torna parte dos valores de crédito <= 0, o que o contrato proíbe.
    client.post("/drift/simulate", json={"credit_noise_std": 1.0})

    response = client.post("/pipeline/stages/production_ingestion_gate/run")

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["violations_count"] > 0
    assert {v["column"] for v in detail["violations"]} == {"Credit amount"}
    stages = {s["name"]: s for s in client.get("/pipeline/stages").json()}
    assert stages["production_ingestion_gate"]["last_execution"]["status"] == "failed"


# --- Detecção e visualização --------------------------------------------------


def test_detect_drift_reports_data_and_concept_drift(client):
    run_stages(client, *TRAINING_STAGES)
    client.post("/drift/simulate")

    response = client.post("/drift/detect")

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["features"]) == len(C.FEATURES)
    assert body["data_drift"]["detected"] is True
    assert {"Age", "Credit amount"} <= set(body["data_drift"]["critical_features"])
    concept = body["concept_drift"]
    assert concept["roc_auc_drop"] == round(concept["reference"]["roc_auc"] - concept["production"]["roc_auc"], 4)
    assert concept["degraded"] == (concept["roc_auc_drop"] >= body["thresholds"]["roc_auc_drop_alert"])
    assert concept["degraded"] is True
    categorical = next(f for f in body["features"] if f["type"] == "categorical")
    assert categorical["ks_pvalue"] is None


def test_detect_drift_without_shock_reports_no_degradation(client):
    """Controle: sem choque, a produção é a Produção-base e o modelo não pode parecer degradado."""
    run_stages(client, *TRAINING_STAGES)
    client.post("/drift/simulate", json=NO_SHOCK)

    body = client.post("/drift/detect").json()

    assert body["data_drift"]["detected"] is False
    concept = body["concept_drift"]
    assert concept["reference"] == concept["production"]
    assert concept["roc_auc_drop"] == 0
    assert concept["accuracy_drop"] == 0
    assert concept["degraded"] is False


def test_report_is_served_after_detection(client):
    assert client.get("/drift/report").status_code == 404

    run_stages(client, *TRAINING_STAGES, "drift_simulation", "drift_detection")
    response = client.get("/drift/report")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")


def test_distributions_match_psi_binning(client):
    assert client.get("/drift/distributions").status_code == 409

    run_stages(client, "data_split", "drift_simulation")
    all_features = client.get("/drift/distributions").json()
    age = client.get("/drift/distributions", params={"feature": "Age"}).json()[0]
    job = client.get("/drift/distributions", params={"feature": "Job"}).json()[0]

    assert [d["feature"] for d in all_features] == C.FEATURES
    assert age["type"] == "numeric" and age["psi_verdict"] == "significativo"
    assert sum(b["reference"] for b in age["bins"]) == pytest.approx(1, abs=1e-3)
    assert sum(b["production"] for b in age["bins"]) == pytest.approx(1, abs=1e-3)
    assert age["bins"][0]["label"].startswith("<") and age["bins"][-1]["label"].startswith("≥")
    assert [b["label"] for b in job["bins"]] == ["0", "1", "2", "3"]


def test_distributions_rejects_unknown_feature(client):
    assert client.get("/drift/distributions", params={"feature": "Salary"}).status_code == 422


# --- Pipeline completo --------------------------------------------------------


def test_pipeline_run_completes_and_is_tracked_in_mlflow(client, tracking_uri):
    response = client.post("/pipeline/runs")

    assert response.status_code == 202
    job_id = response.json()["id"]
    assert response.headers["location"] == f"/pipeline/runs/{job_id}"

    job = wait_for_job(client, job_id)
    assert job["status"] == "succeeded", job["error"]
    run = mlflow.MlflowClient(tracking_uri=tracking_uri).get_run(job["result"]["run_id"])
    assert run.data.tags["pipeline.status"] == "success"
    assert client.get("/pipeline/runs").json()[0]["id"] == job_id


def test_pipeline_failure_is_reported_on_job(client, monkeypatch):
    def broken_training():
        raise RuntimeError("falha simulada no treino")

    monkeypatch.setattr("src.credit.pipeline.train_baseline", broken_training)

    job = wait_for_job(client, client.post("/pipeline/runs").json()["id"])

    assert job["status"] == "failed"
    assert job["error"] == "RuntimeError: falha simulada no treino"
    assert client.get("/health").json()["busy"] is False


def test_unknown_job_returns_404(client):
    assert client.get("/pipeline/runs/inexistente").status_code == 404


def test_concurrent_executions_are_rejected(client):
    lock = client.app.state.executor._lock
    lock.acquire()
    try:
        assert client.post("/pipeline/stages/data_validation/run").status_code == 409
        assert client.post("/drift/detect").status_code == 409
        assert client.post("/pipeline/runs").status_code == 409
        assert client.get("/health").json()["busy"] is True
    finally:
        lock.release()
