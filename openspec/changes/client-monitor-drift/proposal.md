## Why

O frontend em `client/` ainda consumia a API de previsão do PETR4, removida do projeto, e nem compilava (importava `examples/predict_payload.json`, que não existe mais). A API de crédito (`src/api/`) precisa de uma interface para demonstrar a simulação, a detecção e a visualização de drift e para operar o pipeline.

## What Changes

- `client/` passa a consumir a Credit Scoring MLOps API: etapas (`/pipeline/stages`), jobs do pipeline (`/pipeline/runs`), simulação (`/drift/simulate`), detecção (`/drift/detect`), distribuições (`/drift/distributions`) e relatório Evidently (`/drift/report`).
- Novo visual dos controles (stepper do pipeline, cenários, sliders, switch) e das visualizações (stat tiles, PSI ranqueado com limiares, distribuições agrupadas, barras segmentadas de antes × depois), seguindo a paleta validada da skill de dataviz.
- Remoção dos componentes do PETR4 (previsão, gráfico de preços, métricas Prometheus).
- **Substitui** a change pendente `frontend-react-client` (cliente do PETR4).

## Capabilities

### New Capabilities
- `drift-monitor-web-client`: interface web que opera o pipeline de crédito e visualiza o drift pela API.

### Modified Capabilities
- Nenhuma. A API não é alterada.

## Impact

- Apenas `client/` (sem dependências novas: React, Vite, TypeScript e Vitest já existentes).
- O proxy do Vite (`/api` → API) continua igual; a API segue sem CORS.
