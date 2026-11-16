## Context

Ver `proposal.md`. Ajustes pontuais sobre as Etapas 1 e 3 já implementadas.

## Decisions

- **Unicidade via `DataFrameSchema(unique=FEATURES)`**: considera apenas as features (não o target), pois o mesmo perfil com rótulos diferentes também é inconsistência de ingestão. A base German Credit não possui duplicatas, então nenhum registro legítimo é rejeitado.
- **Ingestion Gate dentro do pipeline**: o lote corrompido é submetido a cada run para que o bloqueio fique evidenciado como métrica no MLflow (não apenas no terminal da Etapa 1). Se o lote passar, o pipeline falha, pois a barreira estaria quebrada.
- **Falhas**: o `with mlflow.start_run()` já encerra a run como `FAILED` ao propagar exceção; as tags `pipeline.status`/`pipeline.failed_stage` e o artefato de log tornam o motivo visível no dashboard.

## Non-Goals

- Simulação de concept drift via alteração de labels, métricas de fairness e troca de dataset (registrados como observações no relatório de gaps).
