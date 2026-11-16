"""Contratos (schemas Pydantic) de entrada e saída da API."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from src.credit import config as C
from src.credit.data import simulate_drift as sim
from src.credit.data.contracts import VALID_CHECKING_ACCOUNT
from src.credit.drift.detect import PSI_MAJOR, PSI_MINOR


class StageName(StrEnum):
    """Etapas do pipeline, com os mesmos nomes usados na tag `pipeline.failed_stage` do MLflow."""

    data_validation = "data_validation"
    ingestion_gate = "ingestion_gate"
    data_split = "data_split"
    model_training = "model_training"
    drift_simulation = "drift_simulation"
    production_ingestion_gate = "production_ingestion_gate"
    drift_detection = "drift_detection"


# Enum gerado a partir de config.FEATURES para o Swagger listar as opções válidas.
FeatureName = StrEnum("FeatureName", {feature: feature for feature in C.FEATURES})

ExecutionStatus = Literal["running", "succeeded", "failed"]
FeatureType = Literal["numeric", "categorical"]


# --- Pipeline -----------------------------------------------------------------


class StageExecution(BaseModel):
    stage: StageName
    status: ExecutionStatus
    started_at: datetime
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    result: Any = Field(default=None, description="Saída da etapa (formato varia por etapa).")
    error: str | None = None


class StageInfo(BaseModel):
    name: StageName
    order: int
    description: str
    requires: list[str] = Field(description="Arquivos que precisam existir antes da execução.")
    missing: list[str] = Field(description="Arquivos de `requires` que ainda não existem.")
    ready: bool = Field(description="Verdadeiro quando todos os pré-requisitos existem.")
    last_execution: StageExecution | None = Field(
        default=None, description="Última execução avulsa desta etapa (memória do processo)."
    )


class PipelineJob(BaseModel):
    id: str
    status: ExecutionStatus
    started_at: datetime
    finished_at: datetime | None = None
    duration_seconds: float | None = None
    result: dict[str, Any] | None = Field(
        default=None, description="Resumo de `run_pipeline`, incluindo o `run_id` do MLflow."
    )
    error: str | None = None


# --- Simulação de drift -------------------------------------------------------


class DriftSimulationParams(BaseModel):
    """Intensidade do choque macroeconômico. Os padrões são o cenário oficial da Etapa 2."""

    credit_inflation: float = Field(
        default=sim.CREDIT_INFLATION,
        gt=0,
        le=10,
        description="Multiplicador do valor de crédito (1.6 = +60%; 1.0 = sem inflação).",
    )
    credit_noise_std: float = Field(
        default=sim.CREDIT_NOISE_STD,
        ge=0,
        le=1,
        description="Desvio-padrão do ruído multiplicativo no valor de crédito.",
    )
    age_shift_years: int = Field(
        default=sim.AGE_SHIFT_YEARS,
        ge=-50,
        le=50,
        description="Anos subtraídos da idade (positivo = base mais jovem). A idade mínima é 18.",
    )
    checking_distribution: dict[str, float] | None = Field(
        default_factory=lambda: dict(sim.CHECKING_RECESSION_DIST),
        description=(
            "Nova distribuição de `Checking account` (pesos são normalizados). "
            "`null` mantém a distribuição original."
        ),
    )
    random_state: int = Field(default=C.RANDOM_STATE, description="Semente da simulação.")

    @field_validator("checking_distribution")
    @classmethod
    def _validate_checking_distribution(cls, value: dict[str, float] | None) -> dict[str, float] | None:
        if value is None:
            return value
        unknown = sorted(set(value) - set(VALID_CHECKING_ACCOUNT))
        if unknown:
            raise ValueError(f"categorias inválidas {unknown}; válidas: {VALID_CHECKING_ACCOUNT}")
        if any(weight < 0 for weight in value.values()):
            raise ValueError("os pesos não podem ser negativos")
        if sum(value.values()) <= 0:
            raise ValueError("a soma dos pesos deve ser positiva")
        return value


class NumericChange(BaseModel):
    feature: str
    mean_before: float
    mean_after: float
    median_before: float
    median_after: float


class CategoricalChange(BaseModel):
    feature: str
    before: dict[str, float] = Field(description="Proporção por categoria antes do drift.")
    after: dict[str, float] = Field(description="Proporção por categoria depois do drift.")


class DriftSimulationResult(BaseModel):
    rows: int
    parameters: DriftSimulationParams
    numeric_changes: list[NumericChange]
    categorical_changes: list[CategoricalChange]


# --- Detecção de drift --------------------------------------------------------


class FeatureDrift(BaseModel):
    feature: str
    type: FeatureType
    psi: float
    psi_verdict: str
    ks_statistic: float | None = None
    ks_pvalue: float | None = None
    ks_drift: bool | None = None


class Performance(BaseModel):
    roc_auc: float
    accuracy: float


class DataDrift(BaseModel):
    detected: bool
    critical_features: list[str] = Field(description=f"Features com PSI ≥ {PSI_MAJOR}.")


class ConceptDrift(BaseModel):
    reference: Performance = Field(description="Desempenho de holdout registrado no treino.")
    production: Performance = Field(description="Mesmo modelo sobre o dataset de produção com drift.")
    roc_auc_drop: float
    accuracy_drop: float
    degraded: bool = Field(description="Queda de ROC-AUC acima do limiar de alerta.")


class DriftThresholds(BaseModel):
    psi_moderate: float = PSI_MINOR
    psi_critical: float = PSI_MAJOR
    roc_auc_drop_alert: float


class DriftDetectionResult(BaseModel):
    features: list[FeatureDrift]
    data_drift: DataDrift
    concept_drift: ConceptDrift
    thresholds: DriftThresholds
    report_url: str = "/drift/report"


class DistributionBin(BaseModel):
    label: str = Field(description="Faixa numérica (quantis da referência) ou categoria.")
    reference: float
    production: float


class FeatureDistribution(BaseModel):
    feature: str
    type: FeatureType
    psi: float
    psi_verdict: str
    bins: list[DistributionBin]
