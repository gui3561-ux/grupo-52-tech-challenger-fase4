"""Rotas de drift: simulação, detecção e dados para visualização."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import FileResponse

from src.credit import config as C

from src.api import services
from src.api.dependencies import ExecutorDep
from src.api.schemas import (
    DriftDetectionResult,
    DriftSimulationParams,
    DriftSimulationResult,
    FeatureDistribution,
    FeatureName,
    StageName,
)
from src.api.stages import ensure_prerequisites

router = APIRouter(prefix="/drift", tags=["drift"])


@router.post(
    "/simulate",
    response_model=DriftSimulationResult,
    summary="Simula drift no dataset de produção",
    responses={409: {"description": "Split ainda não executado ou outra execução em andamento."}},
)
def simulate_drift(
    executor: ExecutorDep,
    params: Annotated[DriftSimulationParams | None, Body()] = None,
) -> DriftSimulationResult:
    """Gera `data/production/production.csv` a partir da Produção-base.

    Sem corpo, usa o cenário oficial da Etapa 2. Ruído alto ou deslocamento de idade
    extremo podem gerar valores que o contrato rejeita: a etapa
    `production_ingestion_gate` evidencia o bloqueio.
    """
    return executor.run_stage(StageName.drift_simulation, params=params).result


@router.post(
    "/detect",
    response_model=DriftDetectionResult,
    summary="Detecta Data Drift e Concept Drift",
    responses={409: {"description": "Modelo ou dataset de produção ausentes, ou outra execução em andamento."}},
)
def detect_drift(executor: ExecutorDep) -> DriftDetectionResult:
    """Compara Referência × Produção (PSI/KS) e mede a queda de desempenho do modelo.

    Também regrava `reports/drift_report.html`, `drift_stats.csv` e `drift_summary.md`.
    """
    return executor.run_stage(StageName.drift_detection).result


@router.get(
    "/distributions",
    response_model=list[FeatureDistribution],
    summary="Distribuições Referência × Produção para gráficos",
    responses={409: {"description": "Referência ou Produção com drift ainda não geradas."}},
)
def feature_distributions(feature: FeatureName | None = None) -> list[FeatureDistribution]:
    """Proporção de cada faixa (numéricas, quantis da referência) ou categoria, por dataset.

    É a mesma discretização usada no cálculo do PSI. Calculado na hora a partir dos CSVs.
    """
    ensure_prerequisites("distributions", ("REFERENCE_CSV", "PRODUCTION_CSV"))
    return services.feature_distributions(feature.value if feature else None)


@router.get(
    "/report",
    response_class=FileResponse,
    summary="Relatório HTML interativo do Evidently",
    responses={404: {"description": "Relatório ainda não gerado."}},
)
def drift_report() -> FileResponse:
    if not C.DRIFT_HTML.exists():
        raise HTTPException(status_code=404, detail="Relatório ainda não gerado. Execute POST /drift/detect.")
    return FileResponse(C.DRIFT_HTML, media_type="text/html")
