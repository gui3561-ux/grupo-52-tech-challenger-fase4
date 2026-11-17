"""Orquestrador Unificado do Pipeline de Credit Scoring MLOps (Etapa 3).

Executa todo o ciclo de vida operacional dentro de uma run do MLflow:
1. Validação de contratos de dados (Pandera) + bloqueio de lote corrompido (Ingestion Gate).
2. Particionamento e preparação de dataset (Referência × Produção).
3. Treinamento e avaliação do modelo baseline (XGBoost).
4. Simulação de drift de mercado (Produção validada pelo contrato antes da predição).
5. Detecção de Data Drift e Concept Drift com relatórios Evidently AI e PSI/KS.
6. Centralização de métricas de saúde operacional e rastreabilidade de artefatos.
   Falhas em qualquer estágio marcam a run com `pipeline.status=failed`.

Uso:
    uv run python -m src.credit.pipeline
"""

from __future__ import annotations

import json
from pathlib import Path

import mlflow
import pandas as pd

from src.credit import config as C
from src.credit.data.contracts import (
    DataContractViolationError,
    build_corrupted_batch,
    validate_credit_data,
)
from src.credit.data.preprocess import load_base_dataset, make_reference_production_split
from src.credit.data.simulate_drift import simulate_production_drift
from src.credit.drift.report import build_drift_report
from src.credit.model.baseline import train_baseline
from src.credit.observability import (
    logger,
    DEFAULT_TRACKING_URI,
    log_infra_context,
    log_operational_metrics,
    ROC_AUC_DROP_ALERT_THRESHOLD,
    log_pipeline_artifacts,
    mark_pipeline_failed,
    setup_mlflow,
    track_stage_latency,
    validate_batch_with_tracking,
)


def run_ingestion_gate_check() -> dict[str, int]:
    """Submete um lote corrompido ao contrato e devolve as métricas do bloqueio.

    Roda a cada execução para que o Ingestion Gate fique evidenciado no MLflow,
    e não só no terminal da Etapa 1.
    """
    batch = build_corrupted_batch()
    try:
        validate_credit_data(batch)
    except DataContractViolationError as exc:
        failures = exc.failure_cases
        rejected_rows = int(failures["index"].nunique()) if failures is not None else len(batch)
        logger.warning(
            "Ingestion Gate bloqueou lote com %d registro(s) inválido(s) de %d:\n%s",
            rejected_rows,
            len(batch),
            exc,
        )
        return {
            "contract_rejected_batches": 1,
            "contract_rejected_rows": rejected_rows,
            "contract_violations_count": len(failures) if failures is not None else 0,
        }
    # Se o lote corrompido passar, a barreira está quebrada: não é seguro continuar.
    raise RuntimeError("Ingestion Gate não bloqueou o lote corrompido de controle.")


def run_pipeline(tracking_uri: str = DEFAULT_TRACKING_URI) -> dict[str, str | float]:
    """Executa o pipeline completo de ponta a ponta e registra na run do MLflow.

    `tracking_uri` é parametrizável para que testes não escrevam no mlflow.db do projeto.
    """
    setup_mlflow(tracking_uri)

    logger.info("=================================================================")
    logger.info("   INICIANDO PIPELINE UNIFICADO DE CRÉDITO COM MLFLOW TRACKING   ")
    logger.info("=================================================================")

    latencies: dict[str, float] = {}
    processed_rows: dict[str, int] = {}

    with mlflow.start_run(run_name="credit_scoring_mlops_pipeline") as run:
        run_id = run.info.run_id
        logger.info("MLflow Run iniciada com ID: %s", run_id)
        log_infra_context()

        # Log de parâmetros de governança e configuração
        mlflow.log_params(
            {
                "random_state": C.RANDOM_STATE,
                "production_size": 0.3,
                "target_column": C.TARGET,
                "positive_label": C.POSITIVE_LABEL,
                "model_algorithm": "XGBClassifier",
                "validation_framework": "Pandera",
                "drift_framework": "Evidently AI + SciPy (PSI/KS)",
                "roc_auc_drop_alert_threshold": ROC_AUC_DROP_ALERT_THRESHOLD,
            }
        )

        # Estágio corrente, para marcar a run com o ponto exato de falha.
        stage = "data_validation"
        try:
            # --- Estágio 1: Validação de Contrato e Carga ---
            with track_stage_latency(stage) as s1:
                base_df = load_base_dataset(validate=True)
                processed_rows["raw_base"] = len(base_df)
            latencies["validation"] = s1["duration"]

            # --- Estágio 2: Ingestion Gate (lote corrompido deve ser bloqueado) ---
            stage = "ingestion_gate"
            with track_stage_latency(stage) as s_gate:
                contract_metrics = run_ingestion_gate_check()
            latencies["ingestion_gate"] = s_gate["duration"]

            # --- Estágio 3: Split Referência × Produção ---
            stage = "data_split"
            with track_stage_latency(stage) as s2:
                ref_df, prod_raw_df = make_reference_production_split()
                processed_rows["reference"] = len(ref_df)
                processed_rows["production_raw"] = len(prod_raw_df)
            latencies["split"] = s2["duration"]

            # --- Estágio 4: Treinamento do Modelo Baseline ---
            stage = "model_training"
            with track_stage_latency(stage) as s3:
                train_metrics = train_baseline()
            latencies["training"] = s3["duration"]

            # --- Estágio 5: Simulação de Drift ---
            stage = "drift_simulation"
            with track_stage_latency(stage) as s4:
                prod_drifted = simulate_production_drift()
                processed_rows["production_drifted"] = len(prod_drifted)
            latencies["simulation"] = s4["duration"]

            # --- Estágio 5b: Ingestion Gate no lote de produção ---
            # Em produção, o lote que chega é o dado menos confiável do sistema; ele
            # passa pelo mesmo contrato do treino antes de qualquer inferência.
            stage = "production_ingestion_gate"
            with track_stage_latency(stage) as s4b:
                validate_batch_with_tracking(prod_drifted, batch_name="production")
            latencies["production_ingestion_gate"] = s4b["duration"]

            # --- Estágio 6: Detecção de Drift e Relatórios ---
            stage = "drift_detection"
            with track_stage_latency(stage) as s5:
                drift_results = build_drift_report()
                drift_stats_df = drift_results["stats"]
            latencies["drift_detection"] = s5["duration"]

            # --- Registro de Métricas Operacionais e Artefatos ---
            stage = "metrics_logging"
            logger.info("Registrando métricas de saúde operacional e artefatos no MLflow...")
            logged_metrics = log_operational_metrics(
                latencies=latencies,
                processed_rows=processed_rows,
                drift_stats_df=drift_stats_df,
                eval_metrics=train_metrics,
                contract_metrics=contract_metrics,
                production_metrics=drift_results["perf_production"],
                baseline_metrics=drift_results["perf_reference"],
            )
            log_pipeline_artifacts()
        except Exception as exc:
            mark_pipeline_failed(stage, exc)
            raise

        logger.info("=================================================================")
        logger.info("   PIPELINE UNIFICADO CONCLUÍDO COM SUCESSO!                    ")
        logger.info("   Run ID: %s", run_id)
        logger.info("   Visualize o dashboard executando: uv run mlflow ui          ")
        logger.info("=================================================================")

        return {
            "run_id": run_id,
            "total_latency_seconds": round(sum(latencies.values()), 4),
            "roc_auc_holdout": train_metrics["roc_auc"],
            # Baseline da queda: mesmo modelo na Produção-base (antes do choque).
            "roc_auc_baseline": logged_metrics["production_base_roc_auc"],
            "drift_critical_alerts": logged_metrics["drift_critical_alerts_count"],
            "roc_auc_production": logged_metrics["production_roc_auc"],
            "roc_auc_drop": logged_metrics["roc_auc_drop"],
        }


def main() -> None:
    run_pipeline()


if __name__ == "__main__":
    main()

