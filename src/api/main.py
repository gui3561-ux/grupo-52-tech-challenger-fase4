"""Aplicação FastAPI do pipeline de Credit Scoring.

Uso (a partir da raiz do projeto, pois os caminhos de `src/credit/config.py` são relativos):
    uv run uvicorn src.api.main:app --reload --port 8000

Documentação interativa em http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import json
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.credit.data.contracts import DataContractViolationError
from src.credit.observability import DEFAULT_TRACKING_URI

from src.api.execution import ExecutionInProgressError, Executor
from src.api.routers import drift, pipeline
from src.api.stages import MissingPrerequisiteError

# Limite de violações devolvidas no corpo do 422: um lote de produção inteiro pode
# gerar milhares (ex.: ruído alto zerando o valor de crédito).
MAX_VIOLATIONS_IN_RESPONSE = 100
VIOLATION_COLUMNS = ["column", "check", "failure_case", "index"]


def _contract_violation_body(exc: DataContractViolationError) -> dict:
    failures = exc.failure_cases
    violations = []
    if failures is not None:
        cols = [c for c in VIOLATION_COLUMNS if c in failures.columns]
        violations = json.loads(failures[cols].head(MAX_VIOLATIONS_IN_RESPONSE).to_json(orient="records"))
    return {
        "message": str(exc),
        "violations_count": len(failures) if failures is not None else 1,
        "violations": violations,
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ExecutionInProgressError)
    def _busy(_: Request, exc: ExecutionInProgressError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(MissingPrerequisiteError)
    def _missing(_: Request, exc: MissingPrerequisiteError) -> JSONResponse:
        detail = {"message": str(exc), "missing": exc.missing, "run_first": exc.run_first}
        return JSONResponse(status_code=409, content={"detail": detail})

    @app.exception_handler(DataContractViolationError)
    def _contract(_: Request, exc: DataContractViolationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": _contract_violation_body(exc)})


def create_app(tracking_uri: str | None = None) -> FastAPI:
    app = FastAPI(
        title="Credit Scoring MLOps API",
        version="0.1.0",
        description=(
            "Simulação, detecção e visualização de data drift e execução do pipeline de "
            "Credit Scoring (Tech Challenge Fase 4 — Grupo 98)."
        ),
    )
    app.state.executor = Executor(tracking_uri or os.environ.get("MLFLOW_TRACKING_URI", DEFAULT_TRACKING_URI))
    app.include_router(pipeline.router)
    app.include_router(drift.router)
    register_exception_handlers(app)

    @app.get("/health", tags=["health"], summary="Saúde da API")
    def health() -> dict:
        return {"status": "ok", "busy": app.state.executor.busy}

    return app


app = create_app()
