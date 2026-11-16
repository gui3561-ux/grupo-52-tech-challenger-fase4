## 1. Núcleo

- [x] 1.1 Parametrizar `simulate_production_drift` mantendo os padrões e a ordem de uso do gerador aleatório
- [x] 1.2 Expor `numeric_distribution` e `categorical_distribution` em `detect.py`, reaproveitadas pelo PSI

## 2. API

- [x] 2.1 Schemas Pydantic, registro de etapas com pré-requisitos e executor com lock (`src/api/`)
- [x] 2.2 Rotas de pipeline (`/pipeline/stages`, `/pipeline/runs`) e de drift (`/drift/simulate`, `/drift/detect`, `/drift/distributions`, `/drift/report`)
- [x] 2.3 Mapear erros: pré-requisito ausente e execução concorrente (409), contrato violado (422)
- [x] 2.4 Declarar `fastapi`, `uvicorn` e `httpx` (dev) no `pyproject.toml` e atualizar o `uv.lock`

## 3. Testes e documentação

- [x] 3.1 Testes em `tests/test_credit_api.py` isolados em diretório temporário
- [x] 3.2 Seção da API no README
