## Why

A API de previsão D+1 de PETR4.SA (`src/api/main.py`) só é consumida via Swagger (`/docs`) ou `curl`. Uma interface web facilita a demonstração do modelo: colar a janela de 60 fechamentos, ver a previsão no contexto da série e acompanhar saúde e métricas do serviço.

## What Changes

- Novo frontend React + TypeScript (Vite) na pasta `client/`, consumindo a API em `http://127.0.0.1:8000`.
- Tipos TypeScript espelhando os schemas do OpenAPI (`PredictRequest`, `PredictResponse`, `HTTPValidationError`, `ValidationError`).
- Telas para: status (`/health`, `/ready`), previsão (`POST /predict`) com gráfico da janela + D+1, e métricas (`/metrics`, formato Prometheus).
- Proxy de desenvolvimento do Vite (`/api` → API) porque a API não habilita CORS.

## Capabilities

### New Capabilities
- `prediction-web-client`: interface web que consome a `prediction-api` respeitando o contrato OpenAPI.

### Modified Capabilities
- Nenhuma. A API não é alterada.

## Impact

- Novos arquivos em `client/` (Node ≥ 22.12). Dependências: `react`, `react-dom`; dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, tipos.
- `package-lock.json` deve referenciar `registry.npmjs.org` (repositório público), assim como o `uv.lock` referencia `pypi.org`.
- Sem breaking change: backend, Docker e deploy da API permanecem iguais.
