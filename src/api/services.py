"""Operações da API sobre o pipeline de crédito.

Cada função envolve uma função já existente em `src.credit` e devolve um payload
serializável. Toda a regra de negócio (contrato, simulação, PSI/KS, Evidently) fica
em `src.credit`; aqui só se adapta entrada e saída.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np
import pandas as pd

from src.credit import config as C
from src.credit.data.preprocess import load_base_dataset, make_reference_production_split
from src.credit.data.simulate_drift import DRIFTED_FEATURES, simulate_production_drift
from src.credit.drift.detect import (
    categorical_distribution,
    compute_drift_stats,
    numeric_distribution,
)
from src.credit.drift.report import build_drift_report
from src.credit.model.baseline import train_baseline
from src.credit.observability import ROC_AUC_DROP_ALERT_THRESHOLD, validate_batch_with_tracking
from src.credit.pipeline import run_ingestion_gate_check

from src.api.schemas import (
    CategoricalChange,
    ConceptDrift,
    DataDrift,
    DistributionBin,
    DriftDetectionResult,
    DriftSimulationParams,
    DriftSimulationResult,
    DriftThresholds,
    FeatureDistribution,
    FeatureDrift,
    NumericChange,
    Performance,
)

CRITICAL_VERDICT = "significativo"  # veredito de PSI ≥ PSI_MAJOR em detect.py


def validate_base_dataset() -> dict[str, Any]:
    df = load_base_dataset(validate=True)
    return {"rows": len(df), "contract": "PASSED"}


def check_ingestion_gate() -> dict[str, Any]:
    return run_ingestion_gate_check()


def split_reference_production() -> dict[str, Any]:
    reference, production = make_reference_production_split()
    return {"reference_rows": len(reference), "production_raw_rows": len(production)}


def train_model() -> dict[str, Any]:
    return train_baseline()


def validate_production_batch() -> dict[str, Any]:
    df = validate_batch_with_tracking(pd.read_csv(C.PRODUCTION_CSV), batch_name="production")
    return {"rows": len(df), "contract": "PASSED"}


def simulate_drift(params: DriftSimulationParams | None = None) -> DriftSimulationResult:
    params = params or DriftSimulationParams()
    before = pd.read_csv(C.PRODUCTION_RAW_CSV)
    before["Checking account"] = before["Checking account"].fillna(C.NO_ACCOUNT_FILL)
    after = simulate_production_drift(**params.model_dump())

    numeric, categorical = [], []
    for feature in DRIFTED_FEATURES:
        if feature in C.NUMERIC_FEATURES:
            numeric.append(
                NumericChange(
                    feature=feature,
                    mean_before=round(float(before[feature].mean()), 2),
                    mean_after=round(float(after[feature].mean()), 2),
                    median_before=float(before[feature].median()),
                    median_after=float(after[feature].median()),
                )
            )
        else:
            categories, prop_before, prop_after = categorical_distribution(before[feature], after[feature])
            labels = [str(c) for c in categories]
            categorical.append(
                CategoricalChange(
                    feature=feature,
                    before=dict(zip(labels, np.round(prop_before, 4).tolist())),
                    after=dict(zip(labels, np.round(prop_after, 4).tolist())),
                )
            )
    return DriftSimulationResult(
        rows=len(after), parameters=params, numeric_changes=numeric, categorical_changes=categorical
    )


def detect_drift() -> DriftDetectionResult:
    """Roda o relatório completo (Evidently + PSI/KS + Concept Drift) e grava os artefatos."""
    report = build_drift_report()
    # to_json converte NaN em null e tipos numpy em nativos (KS é nulo nas categóricas).
    features = [FeatureDrift(**row) for row in json.loads(report["stats"].to_json(orient="records"))]
    critical = [f.feature for f in features if f.psi_verdict == CRITICAL_VERDICT]

    ref, prod = report["perf_reference"], report["perf_production"]
    roc_auc_drop = round(ref["roc_auc"] - prod["roc_auc"], 4)
    return DriftDetectionResult(
        features=features,
        data_drift=DataDrift(detected=bool(critical), critical_features=critical),
        concept_drift=ConceptDrift(
            reference=Performance(**ref),
            production=Performance(**prod),
            roc_auc_drop=roc_auc_drop,
            accuracy_drop=round(ref["accuracy"] - prod["accuracy"], 4),
            degraded=roc_auc_drop >= ROC_AUC_DROP_ALERT_THRESHOLD,
        ),
        thresholds=DriftThresholds(roc_auc_drop_alert=ROC_AUC_DROP_ALERT_THRESHOLD),
    )


def _interval_labels(edges: np.ndarray) -> list[str]:
    """Rótulos legíveis para as faixas de PSI, cujas bordas extremas são ±inf."""
    inner = edges[1:-1]
    if len(inner) == 0:
        return ["todos"]
    labels = [f"< {inner[0]:g}"]
    labels += [f"[{low:g}, {high:g})" for low, high in zip(inner[:-1], inner[1:])]
    labels.append(f"≥ {inner[-1]:g}")
    return labels


def feature_distributions(feature: str | None = None) -> list[FeatureDistribution]:
    """Distribuição Referência × Produção por feature, na mesma discretização do PSI."""
    reference = pd.read_csv(C.REFERENCE_CSV)
    production = pd.read_csv(C.PRODUCTION_CSV)
    stats = compute_drift_stats(reference, production).set_index("feature")

    result = []
    for name in [feature] if feature else C.FEATURES:
        if name in C.NUMERIC_FEATURES:
            edges, prop_ref, prop_prod = numeric_distribution(reference[name], production[name])
            labels, kind = _interval_labels(edges), "numeric"
        else:
            categories, prop_ref, prop_prod = categorical_distribution(reference[name], production[name])
            labels, kind = [str(c) for c in categories], "categorical"
        result.append(
            FeatureDistribution(
                feature=name,
                type=kind,
                psi=float(stats.loc[name, "psi"]),
                psi_verdict=str(stats.loc[name, "psi_verdict"]),
                bins=[
                    DistributionBin(label=label, reference=round(float(r), 4), production=round(float(p), 4))
                    for label, r, p in zip(labels, prop_ref, prop_prod)
                ],
            )
        )
    return result
