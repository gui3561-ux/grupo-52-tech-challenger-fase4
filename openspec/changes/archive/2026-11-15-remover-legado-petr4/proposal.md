## Why

O repositório nasceu, em 09/09, como um projeto de previsão do fechamento de PETR4.SA com LSTM, e o Credit Scoring da Fase 4 foi construído por cima sem remover esse código. O README passou a chamá-lo de "Fase 3 (Legado)", mas a Fase 3 do grupo é outro projeto (triagem de laudos médicos). O resultado era um repositório que se apresenta como PETR4 (nome do pacote, Docker e deploy no Render) quando a entrega é o Credit Scoring de uma fintech em degradação silenciosa.

## What Changes

- **BREAKING**: remove o código do LSTM de PETR4.SA (`src/api/`, `src/model/`, `src/data/`, `src/settings.py`), seus testes, modelos (`lstm_petr4.keras`, `scaler.pkl`, `metrics.json`), notebooks `01` e `02`, o exemplo de payload e o cache `data/raw.parquet`.
- Remove o `render.yaml` (web service da API de PETR4.SA).
- `pyproject.toml`: pacote renomeado para `credit-scoring-mlops`; saem `fastapi`, `uvicorn`, `httpx`, `pyarrow`, `tensorflow` e o extra `legacy` (`yfinance`, `tensorflow`). `uv.lock` regenerado.
- `Dockerfile` e `compose.yaml` passam a executar o pipeline de crédito e a UI do MLflow.
- README: sai a seção 7 (Fase 3 / PETR4) e entra a execução em contêiner.

## Capabilities

### Removed Capabilities
- `lstm-forecast`, `prediction-api`, `stock-data-pipeline`.

### Modified Capabilities
- `production-ops`: deixa de descrever a API de PETR4.SA e passa a descrever o pipeline de crédito em contêiner.
- `academic-notebooks`: ficam só o notebook de crédito, a identidade da entrega (agora com o recorte do Credit Scoring) e o guia do README.

## Impact

- Nenhum código de `src/credit/` importava o legado; os 34 testes do Credit Scoring continuam passando.
- `client/` (frontend React da API de PETR4.SA, não versionado) e `openspec/changes/frontend-react-client/` foram mantidos por decisão do grupo, e ficam sem a API que consumiam.
- As changes arquivadas de 09/09 continuam como histórico.
