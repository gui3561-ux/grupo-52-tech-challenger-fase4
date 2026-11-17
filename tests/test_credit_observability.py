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
from src.credit.data.contracts import DataContractViolationError, build_corrupted_batch
from src.credit.observability import validate_batch_with_tracking
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


def test_log_operational_metrics_flags_performance_degradation(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with mlflow.start_run() as run:
        metrics = log_operational_metrics(
            latencies={"validation": 0.05},
            processed_rows={"reference": 700},
            eval_metrics={"roc_auc": 0.85, "accuracy": 0.78},
            production_metrics={"roc_auc": 0.58, "accuracy": 0.63},
        )

    assert metrics["production_roc_auc"] == 0.58
    assert metrics["roc_auc_drop"] == 0.27
    tags = mlflow.get_run(run.info.run_id).data.tags
    assert tags["pipeline.performance_alert"] == "DEGRADED"


def test_log_operational_metrics_measures_drop_against_production_base(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with mlflow.start_run() as run:
        metrics = log_operational_metrics(
            latencies={"validation": 0.05},
            processed_rows={"reference": 700},
            eval_metrics={"roc_auc": 0.85, "accuracy": 0.78},
            production_metrics={"roc_auc": 0.72, "accuracy": 0.71},
            baseline_metrics={"roc_auc": 0.72, "accuracy": 0.71},
        )

    # O holdout otimista (0.85) não entra na queda: a Produção-base tem precedência.
    assert metrics["production_base_roc_auc"] == 0.72
    assert metrics["production_base_accuracy"] == 0.71
    assert metrics["roc_auc_drop"] == 0
    assert metrics["model_roc_auc"] == 0.85
    assert mlflow.get_run(run.info.run_id).data.tags["pipeline.performance_alert"] == "OK"


def test_log_operational_metrics_without_production_skips_performance_tag(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with mlflow.start_run() as run:
        metrics = log_operational_metrics(
            latencies={"validation": 0.05},
            processed_rows={"reference": 700},
            eval_metrics={"roc_auc": 0.85},
        )

    assert "roc_auc_drop" not in metrics
    assert "pipeline.performance_alert" not in mlflow.get_run(run.info.run_id).data.tags


def test_track_stage_latency_records_resource_usage(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with mlflow.start_run() as run:
        with track_stage_latency("busy_stage") as stage:
            sum(i * i for i in range(200_000))

    assert stage["memory_rss_mb"] > 0
    assert stage["cpu_percent"] >= 0
    metrics = mlflow.get_run(run.info.run_id).data.metrics
    assert "memory_rss_mb_busy_stage" in metrics
    assert "cpu_percent_busy_stage" in metrics


def test_track_stage_latency_tags_failed_stage(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with pytest.raises(ValueError):
        with mlflow.start_run() as run:
            with track_stage_latency("data_validation"):
                raise ValueError("lote corrompido")

    finished = mlflow.get_run(run.info.run_id)
    assert finished.info.status == "FAILED"
    assert finished.data.tags["pipeline.status"] == "failed"
    assert finished.data.tags["pipeline.failed_stage"] == "data_validation"


def test_run_pipeline_records_failure_and_reraises(tmp_path, monkeypatch):
    import mlflow
    from src.credit import pipeline

    def broken_loader(**_):
        raise RuntimeError("falha simulada na ingestão")

    monkeypatch.setattr(pipeline, "load_base_dataset", broken_loader)
    tracking_uri = f"sqlite:///{tmp_path}/pipeline_fail.db"

    with pytest.raises(RuntimeError):
        pipeline.run_pipeline(tracking_uri=tracking_uri)

    runs = mlflow.search_runs(experiment_names=["credit-scoring-mlops"])
    assert len(runs) == 1
    assert runs.iloc[0]["status"] == "FAILED"
    assert runs.iloc[0]["tags.pipeline.failed_stage"] == "data_validation"


def test_validate_batch_with_tracking_blocks_and_records(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    with pytest.raises(DataContractViolationError):
        with mlflow.start_run() as run:
            validate_batch_with_tracking(build_corrupted_batch(), batch_name="corrupted")

    finished = mlflow.get_run(run.info.run_id)
    assert finished.info.status == "FAILED"
    assert finished.data.tags["ingestion_gate.corrupted"] == "BLOCKED"
    assert finished.data.metrics["contract_violations_corrupted"] >= 6


def test_validate_batch_with_tracking_passes_clean_batch(tmp_path):
    setup_mlflow(tracking_uri=f"sqlite:///{tmp_path}/test_mlflow.db")
    import mlflow

    clean = build_corrupted_batch().iloc[[0]].assign(Age=30)
    with mlflow.start_run() as run:
        validate_batch_with_tracking(clean, batch_name="clean")

    finished = mlflow.get_run(run.info.run_id)
    assert finished.data.tags["ingestion_gate.clean"] == "PASSED"
    assert finished.data.metrics["contract_violations_clean"] == 0


def test_run_pipeline_returns_summary(tmp_path):
    summary = run_pipeline(tracking_uri=f"sqlite:///{tmp_path}/pipeline_test.db")
    assert "run_id" in summary
    assert summary["total_latency_seconds"] > 0
    assert summary["roc_auc_holdout"] > 0.5
    assert summary["drift_critical_alerts"] >= 0
    import mlflow

    tags = mlflow.get_run(summary["run_id"]).data.tags
    assert "infra.platform" in tags and "infra.cpu_count" in tags
    assert summary["roc_auc_drop"] == round(summary["roc_auc_baseline"] - summary["roc_auc_production"], 4)



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

    monkeypatch.setattr("src.credit.pipeline.train_baseline", _boom)

    with pytest.raises(RuntimeError, match="falha simulada"):
        run_pipeline(tracking_uri=tracking_uri)

    run = mlflow.last_active_run()
    tags = mlflow.get_run(run.info.run_id).data.tags
    assert tags["pipeline.status"] == "failed"
    assert tags["pipeline.failed_stage"] == "model_training"
    assert mlflow.get_run(run.info.run_id).info.status == "FAILED"
