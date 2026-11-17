## ADDED Requirements

### Requirement: Registro de falhas do pipeline
O sistema SHALL marcar a run do MLflow com `pipeline.status=failed` e `pipeline.failed_stage=<estágio>` quando qualquer estágio do pipeline falhar, registrando o erro no log operacional e anexando o log à run.

#### Scenario: Falha em um estágio é visível no dashboard
- **WHEN** um estágio do pipeline levantar exceção
- **THEN** a run recebe as tags de falha, o log de execução é anexado como artefato e a exceção é propagada

### Requirement: Métricas do Ingestion Gate
O sistema SHALL submeter, a cada execução, um lote corrompido à barreira de ingestão e registrar no MLflow as métricas `contract_rejected_batches`, `contract_rejected_rows` e `contract_violations_count`.

#### Scenario: Bloqueio do lote corrompido vira métrica
- **WHEN** o pipeline executa o estágio `ingestion_gate`
- **THEN** o lote é bloqueado e as métricas de rejeição ficam registradas na run
