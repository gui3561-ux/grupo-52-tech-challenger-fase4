"""Execução das etapas e do pipeline completo.

Todas as etapas leem e gravam os mesmos arquivos (data/, models/, reports/). Duas
execuções simultâneas corromperiam umas às outras, então o Executor permite uma por
vez e recusa as demais com ExecutionInProgressError (HTTP 409) em vez de enfileirar:
quem chama decide se tenta de novo.

O histórico (última execução por etapa e jobs do pipeline) fica em memória e se perde
ao reiniciar a API; o registro durável das runs do pipeline é o MLflow.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from src.credit.pipeline import run_pipeline

from src.api.schemas import PipelineJob, StageExecution, StageInfo, StageName
from src.api.stages import STAGE_BY_NAME, STAGES, ensure_prerequisites


class ExecutionInProgressError(Exception):
    """Já existe uma etapa ou um pipeline em execução."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _describe(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"


class Executor:
    def __init__(self, tracking_uri: str) -> None:
        self.tracking_uri = tracking_uri
        self._lock = threading.Lock()
        self._last_stage_runs: dict[StageName, StageExecution] = {}
        self._jobs: dict[str, PipelineJob] = {}

    @property
    def busy(self) -> bool:
        return self._lock.locked()

    def _acquire(self) -> None:
        if not self._lock.acquire(blocking=False):
            raise ExecutionInProgressError("Já existe uma execução em andamento. Tente novamente em instantes.")

    # --- Etapas -----------------------------------------------------------------

    def run_stage(self, stage: StageName, **kwargs: Any) -> StageExecution:
        """Executa uma etapa de forma síncrona; erros da etapa são registrados e propagados."""
        spec = STAGE_BY_NAME[stage]
        self._acquire()
        try:
            ensure_prerequisites(stage, spec.requires)
            execution = StageExecution(stage=stage, status="running", started_at=_now())
            start = time.perf_counter()
            try:
                execution.result = spec.run(**kwargs)
                execution.status = "succeeded"
            except Exception as exc:
                execution.status = "failed"
                execution.error = _describe(exc)
                raise
            finally:
                execution.finished_at = _now()
                execution.duration_seconds = round(time.perf_counter() - start, 4)
                self._last_stage_runs[stage] = execution
            return execution
        finally:
            self._lock.release()

    def list_stages(self) -> list[StageInfo]:
        return [
            StageInfo(
                name=spec.name,
                order=order,
                description=spec.description,
                requires=[str(path) for path in spec.required_paths()],
                missing=[str(path) for path in spec.missing_paths()],
                ready=not spec.missing_paths(),
                last_execution=self._last_stage_runs.get(spec.name),
            )
            for order, spec in enumerate(STAGES, start=1)
        ]

    # --- Pipeline completo --------------------------------------------------------

    def start_pipeline(self) -> PipelineJob:
        """Dispara o pipeline completo em background e devolve o job para acompanhamento."""
        self._acquire()
        job = PipelineJob(id=uuid.uuid4().hex[:12], status="running", started_at=_now())
        self._jobs[job.id] = job
        try:
            threading.Thread(target=self._run_pipeline, args=(job,), name=f"pipeline-{job.id}", daemon=True).start()
        except Exception:
            self._jobs.pop(job.id, None)
            self._lock.release()
            raise
        return job

    def _run_pipeline(self, job: PipelineJob) -> None:
        start = time.perf_counter()
        try:
            job.result = run_pipeline(tracking_uri=self.tracking_uri)
            outcome = "succeeded"
        except Exception as exc:
            # run_pipeline já marcou a run do MLflow como FAILED, com o estágio que quebrou.
            job.error = _describe(exc)
            outcome = "failed"
        finally:
            job.finished_at = _now()
            job.duration_seconds = round(time.perf_counter() - start, 4)
            self._lock.release()
        # Status por último: quem consulta só vê o fim do job com resultado/erro preenchidos.
        job.status = outcome

    def get_job(self, job_id: str) -> PipelineJob | None:
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[PipelineJob]:
        return sorted(self._jobs.values(), key=lambda job: job.started_at, reverse=True)
