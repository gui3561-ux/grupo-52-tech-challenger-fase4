## Context

Ver `proposal.md`. O CLI `openspec` não está instalado no ambiente; a change foi escrita e arquivada à mão, aplicando as deltas em `openspec/specs/` como o `openspec archive` faria.

## Decisions

- **Contêiner com `/app` (código) e `/work` (saídas)**: os caminhos de `src/credit/config.py` são relativos ao diretório corrente. Rodar o pipeline em `/work` faz tudo o que ele grava (`data/`, `models/`, `reports/`, `mlflow.db`, `mlruns/`) cair num único volume nomeado, compartilhado com o serviço `mlflow`. Assim não foi preciso mudar código do pipeline.
- **Volume nomeado, não bind mount do projeto**: o `mlflow.db` local guarda caminhos absolutos do Mac em `artifact_location`; reaproveitá-lo no contêiner quebraria os artefatos. O contêiner cria o próprio store, com caminhos `/work/mlruns/...` válidos nos dois serviços.
- **Versões do lock, índice configurável**: o `uv.lock` aponta para `pypi.apple.com` (mirror de quem gerou o lock). A imagem usa `uv export --frozen` para fixar as mesmas versões e instala de `PACKAGE_INDEX` (padrão `https://pypi.org/simple`), em vez de `uv sync --frozen`, que exigiria acesso ao mirror.
- **`mlflow` depende de `pipeline` com `service_completed_successfully`**: `docker compose up` roda o pipeline uma vez e só então sobe a UI na porta 5001 do host (a 5000 é do AirPlay no macOS).
- **`fastapi`, `uvicorn` e `pyarrow` continuam no lock** como dependências transitivas do MLflow e do Evidently; só deixaram de ser dependências diretas.

## Non-Goals

- Apagar `client/` ou reescrever as changes arquivadas de 09/09.
- Trocar o índice do `uv.lock` para o PyPI público (decisão do grupo; ver lacunas no relatório da remoção).
