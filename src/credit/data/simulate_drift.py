"""Simulação de Drift (Etapa 2).

Constrói o "Dataset de Produção" a partir da partição de produção-base,
alterando **intencionalmente** a distribuição de variáveis importantes para
simular a passagem do tempo e mudanças na economia:

1. `Credit amount` — inflação: valores de crédito ~60% maiores (Data Drift numérico).
2. `Age`           — novos perfis: base de clientes mais jovem (Data Drift numérico).
3. `Checking account` — recessão: mais clientes com pouca liquidez / sem conta
   (Data Drift categórico).

A mudança conjunta também tende a degradar o modelo baseline (Concept Drift),
evidenciado na Etapa 2 pelo relatório de qualidade de classificação.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.credit import config as C

# Fatores da simulação (determinísticos via RANDOM_STATE).
CREDIT_INFLATION = 1.6      # +60% no valor de crédito
CREDIT_NOISE_STD = 0.10     # ruído multiplicativo
AGE_SHIFT_YEARS = 10        # clientes ~10 anos mais jovens
MIN_AGE = 18
# Reamostragem de Checking account para simular recessão (mais "little"/sem conta).
CHECKING_RECESSION_DIST = {
    "little": 0.45,
    C.NO_ACCOUNT_FILL: 0.35,
    "moderate": 0.15,
    "rich": 0.05,
}

DRIFTED_FEATURES = ["Credit amount", "Age", "Checking account"]


def simulate_production_drift(
    random_state: int = C.RANDOM_STATE,
    credit_inflation: float = CREDIT_INFLATION,
    credit_noise_std: float = CREDIT_NOISE_STD,
    age_shift_years: int = AGE_SHIFT_YEARS,
    checking_distribution: dict[str, float] | None = CHECKING_RECESSION_DIST,
) -> pd.DataFrame:
    """Lê production_raw.csv, injeta drift e grava data/production/production.csv.

    Os padrões reproduzem o cenário oficial da Etapa 2. A API os expõe para que a
    intensidade do choque possa ser variada; `checking_distribution=None` mantém a
    distribuição original de `Checking account`.
    """
    if not C.PRODUCTION_RAW_CSV.exists():
        raise FileNotFoundError(
            f"{C.PRODUCTION_RAW_CSV} não encontrado. Rode: uv run python -m src.credit.data.preprocess"
        )
    rng = np.random.default_rng(random_state)
    df = pd.read_csv(C.PRODUCTION_RAW_CSV)
    df["Saving accounts"] = df["Saving accounts"].fillna(C.NO_ACCOUNT_FILL)
    df["Checking account"] = df["Checking account"].fillna(C.NO_ACCOUNT_FILL)

    # 1) Inflação no Credit amount (numérico).
    noise = rng.normal(1.0, credit_noise_std, size=len(df))
    df["Credit amount"] = (df["Credit amount"] * credit_inflation * noise).round().astype(int)

    # 2) Base mais jovem no Age (numérico).
    df["Age"] = (df["Age"] - age_shift_years).clip(lower=MIN_AGE).astype(int)

    # 3) Recessão no Checking account (categórico). A ordem das chamadas ao `rng`
    # é a mesma de antes da parametrização, para os padrões gerarem o mesmo CSV.
    if checking_distribution is not None:
        categories = list(checking_distribution.keys())
        probs = np.array(list(checking_distribution.values()), dtype=float)
        probs = probs / probs.sum()
        df["Checking account"] = rng.choice(categories, size=len(df), p=probs)

    C.PRODUCTION_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(C.PRODUCTION_CSV, index=False)

    print(f"[simulate_drift] Produção com drift: {len(df)} linhas -> {C.PRODUCTION_CSV}")
    print(f"[simulate_drift] Variáveis alteradas: {', '.join(DRIFTED_FEATURES)}")
    return df


if __name__ == "__main__":
    simulate_production_drift()
