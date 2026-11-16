## 1. Remoção do código de PETR4.SA

- [x] 1.1 Remover `src/api/`, `src/model/`, `src/data/` e `src/settings.py`
- [x] 1.2 Remover `tests/test_api.py`, `tests/test_lstm.py`, `tests/test_data_pipeline.py` e `tests/conftest.py` (só configurava o TensorFlow)
- [x] 1.3 Remover `models/lstm_petr4.keras`, `models/scaler.pkl` e `models/metrics.json`
- [x] 1.4 Remover os notebooks `01_exploracao_petr4.ipynb` e `02_treino_e_avaliacao.ipynb`, `examples/predict_payload.json` e o cache `data/raw.parquet`

## 2. Dependências e empacotamento

- [x] 2.1 Renomear o pacote para `credit-scoring-mlops` e remover `fastapi`, `uvicorn`, `httpx`, `pyarrow`, `tensorflow` e o extra `legacy`
- [x] 2.2 Regenerar o `uv.lock` (304 → 226 pacotes)
- [x] 2.3 Reescrever `Dockerfile`, `compose.yaml` e `.dockerignore` para o pipeline de crédito; remover `render.yaml`

## 3. Especificações e documentação

- [x] 3.1 Remover as specs `lstm-forecast`, `prediction-api` e `stock-data-pipeline`; atualizar `production-ops` e `academic-notebooks`
- [x] 3.2 README: remover a seção 7 (Fase 3 / PETR4.SA) e documentar a execução em contêiner

## 4. Verificação

- [x] 4.1 `pytest` numa cópia do projeto: 34 testes passando
- [x] 4.2 Simular o layout do contêiner (`/app` + `/work`) e servir a run com `mlflow server`
- [x] 4.3 `docker-compose config` válido (o build da imagem não foi executado: daemon Docker indisponível)
