FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    CUDA_VISIBLE_DEVICES=-1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# A API serve o LSTM (Keras), por isso o extra `legacy` (tensorflow) é obrigatório.
# Dependências primeiro, em camada própria, para aproveitar o cache do Docker.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --extra legacy --no-install-project

COPY src ./src
COPY models ./models
RUN uv sync --frozen --no-dev --extra legacy

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
