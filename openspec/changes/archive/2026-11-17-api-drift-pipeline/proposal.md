## Why

Hoje o pipeline de Credit Scoring só roda por linha de comando (`run_etapa1`, `run_etapa2`, `pipeline`), sempre com o mesmo cenário de choque. Para demonstrar e explorar o drift (variar a intensidade do choque, ver o efeito no PSI e no modelo, rodar etapa por etapa) é preciso uma interface programática.

## What Changes

- Nova API HTTP (FastAPI) na pasta `src/api/`, sobre as funções já existentes em `src/credit`:
  - **Simulação de drift** com parâmetros (`POST /drift/simulate`).
  - **Detecção** de Data Drift (PSI/KS) e Concept Drift (`POST /drift/detect`).
  - **Visualização**: relatório Evidently (`GET /drift/report`) e distribuições Referência × Produção para gráficos (`GET /drift/distributions`).
  - **Pipeline**: iniciar o pipeline completo em background (`POST /pipeline/runs`) e acompanhar (`GET /pipeline/runs/{id}`).
  - **Etapas**: listar com pré-requisitos (`GET /pipeline/stages`) e executar uma etapa isolada (`POST /pipeline/stages/{stage}/run`).
- `simulate_production_drift` aceita a intensidade do choque como parâmetros opcionais; os padrões continuam gerando exatamente o mesmo dataset.
- `detect.py` expõe a discretização usada no PSI (`numeric_distribution`, `categorical_distribution`), sem mudar os valores calculados.

## Capabilities

### New Capabilities
- `credit-drift-api`: API HTTP para simular, detectar e visualizar drift e para executar o pipeline e suas etapas.

### Modified Capabilities
- `credit-drift-monitoring`: a simulação passa a aceitar a intensidade do choque como parâmetro.

## Impact

- Dependências diretas `fastapi` e `uvicorn` (já presentes de forma transitiva via MLflow; versões do `uv.lock` inalteradas) e `httpx` no grupo `dev` para o `TestClient`.
- Sem breaking change: CLIs, pipeline, MLflow e Docker permanecem iguais.
