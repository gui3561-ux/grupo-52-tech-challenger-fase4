# production-ops Specification

## Purpose

Permite executar o pipeline de Credit Scoring em contêiner e inspecionar a run gerada pela UI do MLflow, sem depender do ambiente local de quem avalia.

## Requirements

### Requirement: Execução do pipeline de crédito em contêiner
O repositório SHALL oferecer uma imagem Docker que executa o pipeline unificado de Credit Scoring (`python -m src.credit.pipeline`) a partir apenas do CSV base versionado em `data/raw/`, gerando referência, produção, modelo, relatórios e a run do MLflow dentro do contêiner.

#### Scenario: Pipeline roda no contêiner
- **WHEN** o avaliador executa `docker compose run --rm pipeline`
- **THEN** o pipeline conclui todos os estágios e grava `data/reference/`, `data/production/`, `models/`, `reports/`, `mlflow.db` e `mlruns/` no volume de trabalho `/work`

#### Scenario: Dependências fixadas e portáveis
- **WHEN** a imagem é construída fora da rede do mirror registrado no `uv.lock`
- **THEN** a imagem instala as mesmas versões fixadas no `uv.lock` a partir de um índice configurável (`PACKAGE_INDEX`, padrão `https://pypi.org/simple`)

### Requirement: Inspeção da run do MLflow em contêiner
O `compose.yaml` SHALL expor a UI do MLflow lendo o mesmo volume do pipeline e SHALL iniciá-la somente depois que o pipeline terminar com sucesso.

#### Scenario: UI após o pipeline
- **WHEN** o avaliador executa `docker compose up --build`
- **THEN** o serviço `mlflow` sobe depois do `pipeline` e mostra, em `http://127.0.0.1:5001`, a run com métricas, tags de alerta e artefatos
