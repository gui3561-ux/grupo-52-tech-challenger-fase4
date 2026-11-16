"""Rotas de orquestração: listar e executar etapas, iniciar e acompanhar o pipeline completo."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status

from src.api.dependencies import ExecutorDep
from src.api.schemas import PipelineJob, StageExecution, StageInfo, StageName

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/stages", response_model=list[StageInfo], summary="Lista as etapas e seus pré-requisitos")
def list_stages(executor: ExecutorDep) -> list[StageInfo]:
    return executor.list_stages()


@router.post(
    "/stages/{stage}/run",
    response_model=StageExecution,
    summary="Executa uma etapa isolada",
    responses={
        409: {"description": "Pré-requisitos ausentes ou outra execução em andamento."},
        422: {"description": "Lote bloqueado pelo contrato de dados."},
    },
)
def run_stage(stage: StageName, executor: ExecutorDep) -> StageExecution:
    """Executa a etapa de forma síncrona, com os parâmetros padrão do projeto.

    As etapas trocam dados por arquivos: rode-as na ordem de `GET /pipeline/stages`.
    Para simular drift com outros parâmetros, use `POST /drift/simulate`.
    """
    return executor.run_stage(stage)


@router.post(
    "/runs",
    response_model=PipelineJob,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Inicia o pipeline completo em background",
    responses={409: {"description": "Outra execução em andamento."}},
)
def start_pipeline(response: Response, executor: ExecutorDep) -> PipelineJob:
    """Roda `src.credit.pipeline.run_pipeline` (todas as etapas + registro no MLflow).

    Acompanhe o job em `GET /pipeline/runs/{id}`; ao final, `result.run_id` é a run do MLflow.
    """
    job = executor.start_pipeline()
    response.headers["Location"] = f"/pipeline/runs/{job.id}"
    return job


@router.get("/runs", response_model=list[PipelineJob], summary="Lista os jobs do pipeline (mais recente primeiro)")
def list_pipeline_runs(executor: ExecutorDep) -> list[PipelineJob]:
    return executor.list_jobs()


@router.get("/runs/{job_id}", response_model=PipelineJob, summary="Consulta um job do pipeline")
def get_pipeline_run(job_id: str, executor: ExecutorDep) -> PipelineJob:
    job = executor.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' não encontrado.")
    return job
