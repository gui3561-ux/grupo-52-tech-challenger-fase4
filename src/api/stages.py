"""Registro das etapas do pipeline executáveis individualmente pela API.

As etapas espelham `src/credit/pipeline.py` e se comunicam por arquivos
(data/, models/, reports/). Por isso cada etapa declara os arquivos de que depende:
quem chama fora de ordem recebe a lista de etapas a executar antes, em vez de um
FileNotFoundError genérico.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.credit import config as C

from src.api import services
from src.api.schemas import StageName

# Etapa que gera cada arquivo. Os arquivos são referenciados pelo nome do atributo em
# `src.credit.config` e resolvidos na hora da checagem, para respeitar caminhos
# alterados em tempo de execução (ex.: testes com monkeypatch).
PRODUCED_BY: dict[str, StageName] = {
    "REFERENCE_CSV": StageName.data_split,
    "PRODUCTION_RAW_CSV": StageName.data_split,
    "MODEL_PATH": StageName.model_training,
    "MODEL_METRICS_PATH": StageName.model_training,
    "PRODUCTION_CSV": StageName.drift_simulation,
}


class MissingPrerequisiteError(Exception):
    """Arquivos de entrada ausentes: alguma etapa anterior ainda não foi executada."""

    def __init__(self, target: str, missing: list[Path], run_first: list[StageName]) -> None:
        self.missing = [str(path) for path in missing]
        self.run_first = run_first
        hint = (
            f"Execute antes: {', '.join(run_first)}."
            if run_first
            else "Gere o dataset base com: uv run python -m src.credit.data.make_dataset"
        )
        super().__init__(f"Pré-requisitos ausentes para '{target}': {', '.join(self.missing)}. {hint}")


@dataclass(frozen=True)
class StageSpec:
    name: StageName
    description: str
    requires: tuple[str, ...]
    run: Callable[..., Any]

    def required_paths(self) -> list[Path]:
        return [getattr(C, attr) for attr in self.requires]

    def missing_paths(self) -> list[Path]:
        return [path for path in self.required_paths() if not path.exists()]


STAGES: tuple[StageSpec, ...] = (
    StageSpec(
        StageName.data_validation,
        "Carrega o dataset base e valida contra o contrato Pandera.",
        ("RAW_CSV",),
        services.validate_base_dataset,
    ),
    StageSpec(
        StageName.ingestion_gate,
        "Submete um lote propositalmente corrompido e confirma que o contrato o bloqueia.",
        (),
        services.check_ingestion_gate,
    ),
    StageSpec(
        StageName.data_split,
        "Separa Referência (treino) e Produção-base (semente do drift).",
        ("RAW_CSV",),
        services.split_reference_production,
    ),
    StageSpec(
        StageName.model_training,
        "Treina o baseline XGBoost na Referência e grava modelo e métricas de holdout.",
        ("REFERENCE_CSV",),
        services.train_model,
    ),
    StageSpec(
        StageName.drift_simulation,
        "Injeta o choque macroeconômico (inflação, base mais jovem, recessão) na Produção.",
        ("PRODUCTION_RAW_CSV",),
        services.simulate_drift,
    ),
    StageSpec(
        StageName.production_ingestion_gate,
        "Valida o lote de produção com drift contra o mesmo contrato do treino.",
        ("PRODUCTION_CSV",),
        services.validate_production_batch,
    ),
    StageSpec(
        StageName.drift_detection,
        "Calcula PSI/KS, Concept Drift e gera o relatório HTML do Evidently.",
        ("REFERENCE_CSV", "PRODUCTION_CSV", "MODEL_PATH", "MODEL_METRICS_PATH"),
        services.detect_drift,
    ),
)

STAGE_BY_NAME: dict[StageName, StageSpec] = {stage.name: stage for stage in STAGES}


def ensure_prerequisites(target: str, requires: Iterable[str]) -> None:
    """Levanta MissingPrerequisiteError se algum dos arquivos exigidos não existir."""
    missing_attrs = [attr for attr in requires if not getattr(C, attr).exists()]
    if not missing_attrs:
        return
    run_first = sorted(
        {PRODUCED_BY[attr] for attr in missing_attrs if attr in PRODUCED_BY},
        key=list(StageName).index,
    )
    raise MissingPrerequisiteError(target, [getattr(C, attr) for attr in missing_attrs], run_first)
