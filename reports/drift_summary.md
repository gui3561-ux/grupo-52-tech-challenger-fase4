# Relatório de Drift — Etapa 2

Comparação entre o **Dataset de Referência** (treino do baseline) e o 
**Dataset de Produção** (com degradação injetada simulando a passagem do tempo).

## Data Drift (mudança de distribuição das features)

Features com drift **significativo** (PSI ≥ 0.25): `Age`, `Credit amount`

PSI/KS por feature (detalhe em `drift_stats.csv`):

| feature | type | psi | psi_verdict | ks_statistic | ks_pvalue | ks_drift |
|---|---|---|---|---|---|---|
| Age | numeric | 1.0821 | significativo | 0.4189 | 0.0 | True |
| Credit amount | numeric | 0.4531 | significativo | 0.267 | 0.0 | True |
| Checking account | categorical | 0.1413 | moderado |  |  |  |
| Duration | numeric | 0.0637 | estável | 0.0398 | 0.069933 | False |
| Purpose | categorical | 0.0341 | estável |  |  |  |
| Saving accounts | categorical | 0.0321 | estável |  |  |  |
| Job | categorical | 0.0037 | estável |  |  |  |
| Housing | categorical | 0.0031 | estável |  |  |  |
| Sex | categorical | 0.0004 | estável |  |  |  |

## Concept Drift (degradação do modelo)

Produção-base = mesmo modelo sobre a partição de produção **antes do choque** (nunca vista no treino); Produção = mesmo modelo sobre o dataset com drift (labels reais preservados). A queda isola o efeito do choque.

| Métrica | Produção-base (sem choque) | Produção | Queda |
|---|---|---|---|
| ROC-AUC | 0.7238 | 0.5762 | 0.1476 |
| Accuracy | 0.7167 | 0.63 | 0.0867 |

Holdout do treino (informativo): ROC-AUC 0.852, accuracy 0.7886. Ele não é usado como baseline porque é otimista: as linhas sintéticas da Referência foram geradas a partir das mesmas linhas reais que caem no holdout.

> O relatório visual completo do Evidently está em `drift_report.html`.
