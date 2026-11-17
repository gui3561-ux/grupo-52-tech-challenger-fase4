## 1. Contrato de dados

- [x] 1.1 Adicionar regra de unicidade ao `CREDIT_DATA_SCHEMA`
- [x] 1.2 Incluir duplicata proposital em `build_corrupted_batch()`
- [x] 1.3 Testes de duplicata em `tests/test_credit_contracts.py`

## 2. Observabilidade de falhas

- [x] 2.1 Estágio `ingestion_gate` com métricas `contract_*` no MLflow
- [x] 2.2 Validar Produção com drift antes da detecção/predição
- [x] 2.3 Marcar `pipeline.status=failed` e `pipeline.failed_stage` em falhas
- [x] 2.4 Testes de falha e métricas de contrato em `tests/test_credit_observability.py`

## 3. Documentação

- [x] 3.1 Corrigir README (XGBoost, caminhos, fator de inflação, novas métricas)
- [x] 3.2 Executar `uv run pytest tests/`
