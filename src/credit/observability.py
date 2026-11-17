"""Módulo de Observabilidade, Logging Estruturado e Rastreamento com MLflow (Etapa 3).

Centraliza:
1. Configuração de logger estruturado operacional para todas as etapas.
2. Medição de latência e saúde operacional por estágio do pipeline.
3. Rastreamento de experimentos, hiperparâmetros, métricas e artefatos no MLflow.
"""

from __future__ import annotations

import logging
import os
import platform
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

import mlflow
import pandas as pd
import psutil

from src.credit import config as C
from src.credit.data.contracts import DataContractViolationError, validate_credit_data

# Desabilita hints invasivos do agente MLflow
os.environ["MLFLOW_DISABLE_AGENT_HINT"] = "1"

EXPERIMENT_NAME = "credit-scoring-mlops"
DEFAULT_TRACKING_URI = "sqlite:///mlflow.db"
LOG_FILE = Path("reports") / "pipeline_execution.log"

# Queda máxima tolerada de ROC-AUC (holdout -> produção) antes de marcar a run
# como degradada. Data drift (PSI) mostra que a entrada mudou; esta queda mostra
# que a mudança afetou o negócio. 0.05 é uma tolerância prática comum para
# scoring; deve ser recalibrada com o time de risco.
ROC_AUC_DROP_ALERT_THRESHOLD = 0.05


def configure_logger(name: str = "credit.pipeline", level: int = logging.INFO) -> logging.Logger:
    """Configura logger estruturado com saída em console e arquivo de log operacional."""
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if not logger.handlers:
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


logger = configure_logger()


def setup_mlflow(tracking_uri: str = DEFAULT_TRACKING_URI) -> None:
    """Inicializa o tracking local do MLflow e define o experimento oficial."""
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment(EXPERIMENT_NAME)
    logger.info("MLflow configurado com Tracking URI: '%s' | Experimento: '%s'", tracking_uri, EXPERIMENT_NAME)


@contextmanager
def track_stage_latency(stage_name: str) -> Generator[dict[str, float], None, None]:
    """Context manager para cronometrar a duração de execução de um estágio do pipeline."""
    result: dict[str, float] = {"duration": 0.0}
    process = psutil.Process()
    cpu_before = process.cpu_times()
    start = time.perf_counter()
    logger.info(">>> Iniciando estágio: [%s]", stage_name)
    try:
        yield result
    except Exception:
        # Sem isso a run aparece só como FAILED no MLflow, sem dizer onde
        # quebrou. As tags permitem filtrar falhas por estágio na UI.
        logger.exception("!!! Falha no estágio: [%s]", stage_name)
        if mlflow.active_run() is not None:
            mlflow.set_tag("pipeline.status", "failed")
            mlflow.set_tag("pipeline.failed_stage", stage_name)
        raise
    finally:
        elapsed = time.perf_counter() - start
        result["duration"] = round(elapsed, 4)

        # Saúde da infraestrutura por estágio: memória residente do processo e
        # uso de CPU (tempo de CPU / tempo de parede; >100% = mais de um núcleo).
        # Um estágio que passa a consumir muito mais memória ou CPU entre runs é
        # sinal de dado maior que o esperado ou de regressão de código.
        cpu_after = process.cpu_times()
        cpu_seconds = (cpu_after.user - cpu_before.user) + (cpu_after.system - cpu_before.system)
        result["cpu_percent"] = round(100 * cpu_seconds / elapsed, 1) if elapsed > 0 else 0.0
        result["memory_rss_mb"] = round(process.memory_info().rss / 1024**2, 1)
        if mlflow.active_run() is not None:
            mlflow.log_metric(f"cpu_percent_{stage_name}", result["cpu_percent"])
            mlflow.log_metric(f"memory_rss_mb_{stage_name}", result["memory_rss_mb"])

        logger.info(
            "<<< Concluído estágio: [%s] em %.4f segundos | CPU %.1f%% | RSS %.1f MB",
            stage_name,
            elapsed,
            result["cpu_percent"],
            result["memory_rss_mb"],
        )


def log_infra_context() -> None:
    """Registra como tags o ambiente em que a run executou.

    Sem isso não dá para saber se uma mudança de latência ou memória entre runs
    veio do código ou da máquina (ex.: Mac M1 local vs. container Linux).
    """
    mlflow.set_tags(
        {
            "infra.platform": platform.platform(),
            "infra.python_version": platform.python_version(),
            "infra.cpu_count": str(os.cpu_count()),
            "infra.total_memory_gb": str(round(psutil.virtual_memory().total / 1024**3, 1)),
        }
    )


def validate_batch_with_tracking(df: pd.DataFrame, batch_name: str) -> pd.DataFrame:
    """Passa um lote pelo contrato Pandera e registra o resultado no MLflow.

    O contrato sozinho só levanta exceção; sem este registro, um bloqueio de
    ingestão não aparece no dashboard. Grava `contract_violations_<lote>` e a tag
    `ingestion_gate.<lote>` = PASSED/BLOCKED. Em caso de bloqueio, re-levanta a
    exceção: o pipeline deve parar, não seguir com dados inválidos.
    """
    try:
        validated = validate_credit_data(df)
    except DataContractViolationError as exc:
        violations = len(exc.failure_cases) if exc.failure_cases is not None else 1
        logger.error("Ingestion gate BLOQUEOU o lote '%s': %d violação(ões)", batch_name, violations)
        if mlflow.active_run() is not None:
            mlflow.log_metric(f"contract_violations_{batch_name}", violations)
            mlflow.set_tag(f"ingestion_gate.{batch_name}", "BLOCKED")
        raise

    logger.info("Ingestion gate aprovou o lote '%s' (%d linhas)", batch_name, len(validated))
    if mlflow.active_run() is not None:
        mlflow.log_metric(f"contract_violations_{batch_name}", 0)
        mlflow.set_tag(f"ingestion_gate.{batch_name}", "PASSED")
    return validated


def log_operational_metrics(
    latencies: dict[str, float],
    processed_rows: dict[str, int],
    drift_stats_df: Any | None = None,
    eval_metrics: dict[str, Any] | None = None,
    contract_metrics: dict[str, int] | None = None,
    production_metrics: dict[str, Any] | None = None,
    baseline_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Registra no MLflow métricas operacionais, parâmetros e contagem de alertas.

    `baseline_metrics` é o desempenho na Produção-base (antes do choque). Quando
    informado, a queda de ROC-AUC é medida contra ele; sem ele, contra o holdout
    de `eval_metrics` (comportamento anterior).

    Retorna o dicionário de métricas registradas.
    """
    logged_metrics: dict[str, float] = {}

    # 1. Latências por estágio
    for stage, duration in latencies.items():
        key = f"latency_{stage}_seconds"
        mlflow.log_metric(key, duration)
        logged_metrics[key] = duration
    total_latency = round(sum(latencies.values()), 4)
    mlflow.log_metric("latency_total_seconds", total_latency)
    logged_metrics["latency_total_seconds"] = total_latency

    # 2. Volume de registros processados
    for dataset_name, count in processed_rows.items():
        key = f"rows_{dataset_name}"
        mlflow.log_metric(key, count)
        logged_metrics[key] = count

    # 3. Métricas do modelo baseline
    if eval_metrics:
        for metric_name in ["roc_auc", "accuracy", "f1_bad"]:
            if metric_name in eval_metrics:
                key = f"model_{metric_name}"
                val = float(eval_metrics[metric_name])
                mlflow.log_metric(key, val)
                logged_metrics[key] = val

    # 3b. Performance em produção (Concept Drift). Sem isso o dashboard só mostra
    # o modelo "saudável" do holdout e a degradação silenciosa fica invisível.
    performance_degraded = False
    if production_metrics:
        for metric_name in ["roc_auc", "accuracy"]:
            if metric_name in production_metrics:
                key = f"production_{metric_name}"
                val = float(production_metrics[metric_name])
                mlflow.log_metric(key, val)
                logged_metrics[key] = val

        for metric_name in ["roc_auc", "accuracy"]:
            if baseline_metrics and metric_name in baseline_metrics:
                key = f"production_base_{metric_name}"
                val = float(baseline_metrics[metric_name])
                mlflow.log_metric(key, val)
                logged_metrics[key] = val

        # O holdout é otimista (sintéticos da Referência vêm das mesmas linhas reais),
        # por isso a Produção-base tem precedência como baseline da queda.
        expected = baseline_metrics if baseline_metrics and "roc_auc" in baseline_metrics else eval_metrics
        if expected and "roc_auc" in expected and "roc_auc" in production_metrics:
            drop = round(float(expected["roc_auc"]) - float(production_metrics["roc_auc"]), 4)
            mlflow.log_metric("roc_auc_drop", drop)
            logged_metrics["roc_auc_drop"] = drop
            performance_degraded = drop >= ROC_AUC_DROP_ALERT_THRESHOLD

    # 4. Resultado do Ingestion Gate (lotes/registros bloqueados pelo contrato)
    for key, val in (contract_metrics or {}).items():
        mlflow.log_metric(key, val)
        logged_metrics[key] = val

    # 5. Métricas estatísticas de drift e contagem de alertas
    critical_alerts = 0
    if drift_stats_df is not None:
        for _, row in drift_stats_df.iterrows():
            feat = row["feature"].replace(" ", "_")
            psi = float(row["psi"])
            mlflow.log_metric(f"psi_{feat}", psi)
            logged_metrics[f"psi_{feat}"] = psi
            if row.get("ks_pvalue") is not None and not pd.isna(row["ks_pvalue"]):
                mlflow.log_metric(f"ks_pvalue_{feat}", float(row["ks_pvalue"]))

            if row.get("psi_verdict") == "significativo":
                critical_alerts += 1

    mlflow.log_metric("drift_critical_alerts_count", critical_alerts)
    logged_metrics["drift_critical_alerts_count"] = critical_alerts

    # Tags de status
    mlflow.set_tag("pipeline.status", "success")
    mlflow.set_tag("pipeline.drift_alert", "CRITICAL" if critical_alerts > 0 else "OK")
    if production_metrics:
        mlflow.set_tag("pipeline.performance_alert", "DEGRADED" if performance_degraded else "OK")

    logger.info(
        "Métricas registradas no MLflow: latência total=%.4fs, alertas críticos de drift=%d",
        sum(latencies.values()),
        critical_alerts,
    )
    return logged_metrics


def mark_pipeline_failed(stage_name: str, error: Exception) -> None:
    """Marca a run ativa como falha, tornando o estágio e o erro visíveis no MLflow."""
    logger.exception("Pipeline interrompido no estágio [%s]: %s", stage_name, error)
    mlflow.set_tag("pipeline.status", "failed")
    mlflow.set_tag("pipeline.failed_stage", stage_name)
    mlflow.set_tag("pipeline.error", f"{type(error).__name__}: {error}"[:500])
    if LOG_FILE.exists():
        mlflow.log_artifact(str(LOG_FILE))


def log_pipeline_artifacts() -> None:
    """Registra relatórios e modelos gerados como artefatos rastreáveis na run do MLflow."""
    artifacts = [
        C.DRIFT_HTML,
        C.DRIFT_STATS_CSV,
        C.DRIFT_SUMMARY_MD,
        C.MODEL_PATH,
        C.MODEL_METRICS_PATH,
        LOG_FILE,
    ]
    for art in artifacts:
        if art.exists():
            mlflow.log_artifact(str(art))
            logger.info("Artefato registrado no MLflow: %s", art)
        else:
            logger.warning("Artefato esperado não encontrado para registro: %s", art)
