"""Dependências injetadas nas rotas."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from src.api.execution import Executor


def get_executor(request: Request) -> Executor:
    # Um Executor por app (criado em create_app): testes ganham estado isolado.
    return request.app.state.executor


ExecutorDep = Annotated[Executor, Depends(get_executor)]
