## Why

A revisão do enunciado (`MELT.pdf`) contra o código revelou lacunas nos critérios de maior peso:
- **Validação de Dados (25%)**: o README e o enunciado citam a regra "sem duplicatas", mas o contrato Pandera não a implementa; o dataset de Produção não passa pelo contrato antes das predições.
- **Observabilidade (20%)**: o pipeline unificado só registra sucesso. O enunciado pede logs de "sucesso/falhas na ingestão e transformação", mas falhas não são marcadas na run do MLflow e o bloqueio de lotes pelo contrato não vira métrica.

## What Changes

- Regra de unicidade de registros no `CREDIT_DATA_SCHEMA` e duplicata proposital em `build_corrupted_batch()`.
- Pipeline (`src/credit/pipeline.py`):
  - estágio `ingestion_gate` submete o lote corrompido e registra `contract_rejected_batches`, `contract_rejected_rows` e `contract_violations_count`;
  - o dataset de Produção com drift é validado pelo contrato antes da detecção/predição;
  - falhas em qualquer estágio marcam `pipeline.status=failed` e `pipeline.failed_stage`, e o log de execução é anexado à run.
- Correção de inconsistências do README (algoritmo XGBoost, caminhos de arquivos, fator de inflação).

## Capabilities

### Modified Capabilities
- `credit-data-pipeline`: contrato passa a rejeitar registros duplicados; Produção é validada antes da predição.
- `credit-pipeline-observability`: registro de falhas e de métricas do Ingestion Gate.

## Impact

- `src/credit/data/contracts.py`, `src/credit/observability.py`, `src/credit/pipeline.py`, `README.md`, testes.
- Sem breaking change: assinaturas públicas mantidas (novo parâmetro opcional em `log_operational_metrics`).
