FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# O XGBoost precisa do runtime OpenMP (libgomp) no Linux.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Índice de onde os pacotes são baixados. O uv.lock guarda as URLs do mirror de quem
# gerou o lock (hoje pypi.apple.com, inacessível fora dessa rede). Por isso a imagem
# instala as MESMAS versões fixadas no lock, mas a partir deste índice.
# Troque com: docker compose build --build-arg PACKAGE_INDEX=<url>
ARG PACKAGE_INDEX=https://pypi.org/simple

# Código em /app. Dependências primeiro, em camada própria, para aproveitar o cache do Docker.
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt \
    && uv pip install --system --default-index "$PACKAGE_INDEX" -r requirements.txt
COPY src ./src

# Diretório de trabalho do pipeline. Os caminhos de src/credit/config.py são relativos
# (data/, models/, reports/, mlflow.db, mlruns/), então tudo o que o pipeline grava cai
# aqui. Separar /work de /app permite montar um volume só com as saídas; o volume nomeado
# é inicializado com o CSV base na primeira execução.
WORKDIR /work
COPY data/raw ./data/raw

ENV PYTHONPATH=/app

CMD ["python", "-m", "src.credit.pipeline"]
