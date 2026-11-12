from __future__ import annotations

import time
import pandas as pd
import pytest

from src.credit.observability import (
    configure_logger,
    log_operational_metrics,
    setup_mlflow,
    track_stage_latency,
)
from src.credit.pipeline import run_ingestion_gate_check, run_pipeline


def test_configure_logger():
    logger = configure_logger("test.observability")
    assert logger.name == "test.observability"
    assert len(logger.handlers) >= 1


def test_track_stage_latency():
    with track_stage_latency("sample_stage") as stage:
        time.sleep(0.02)
    assert stage["duration"] >= 0.01


def test_log_operational_metrics_calculation(tmp_path, monkeypatch):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    drift_stats = pd.DataFrame(
        [
            {"feature": "Age", "psi": 1.10, "psi_verdict": "significativo", "ks_pvalue": 0.0001},
            {"feature": "Credit amount", "psi": 0.45, "psi_verdict": "significativo", "ks_pvalue": 0.0001},
            {"feature": "Duration", "psi": 0.04, "psi_verdict": "estável", "ks_pvalue": 0.85},
        ]
    )
    latencies = {"validation": 0.05, "training": 0.20}
    rows = {"reference": 700, "production": 300}

    with mlflow.start_run() as run:
        metrics = log_operational_metrics(
            latencies=latencies,
            processed_rows=rows,
            drift_stats_df=drift_stats,
            eval_metrics={"roc_auc": 0.76, "accuracy": 0.72},
        )

    assert metrics["drift_critical_alerts_count"] == 2
    assert metrics["latency_validation_seconds"] == 0.05
    assert metrics["latency_total_seconds"] == 0.25
    assert metrics["rows_reference"] == 700
    assert metrics["model_roc_auc"] == 0.76


def test_run_pipeline_returns_summary(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/pipeline_test.db")
    summary = run_pipeline()
    assert "run_id" in summary
    assert summary["total_latency_seconds"] > 0
    assert summary["roc_auc_holdout"] > 0.5
    assert summary["drift_critical_alerts"] >= 0



def test_run_ingestion_gate_check_blocks_corrupted_batch():
    metrics = run_ingestion_gate_check()
    assert metrics["contract_rejected_batches"] == 1
    # 4 registros com violações de campo + 1 duplicata (índice 4 é válido)
    assert metrics["contract_rejected_rows"] == 5
    assert metrics["contract_violations_count"] >= 6


def test_run_pipeline_marks_failed_stage(tmp_path, monkeypatch):
    import mlflow

    tracking_uri = f"sqlite:///{tmp_path}/pipeline_fail.db"

    def _boom():
        raise RuntimeError("falha simulada no treino")

    monkeypatch.setattr("src.credit.pipeline.setup_mlflow", lambda: setup_mlflow(tracking_uri=tracking_uri))
    monkeypatch.setattr("src.credit.pipeline.train_baseline", _boom)

    with pytest.raises(RuntimeError, match="falha simulada"):
        run_pipeline()

    run = mlflow.last_active_run()
    tags = mlflow.get_run(run.info.run_id).data.tags
    assert tags["pipeline.status"] == "failed"
    assert tags["pipeline.failed_stage"] == "model_training"
    assert mlflow.get_run(run.info.run_id).info.status == "FAILED"
