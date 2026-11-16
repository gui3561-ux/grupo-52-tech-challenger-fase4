## MODIFIED Requirements

### Requirement: Simulação controlada de degradação em produção
O sistema SHALL criar o dataset de produção injetando alterações determinísticas na distribuição de variáveis críticas: aumento inflacionário com ruído em `Credit amount`, redução média de idade em `Age` e reamostragem simulando recessão com menor liquidez em `Checking account`. A intensidade de cada alteração SHALL ser parametrizável, com padrões que reproduzem o cenário oficial da Etapa 2.

#### Scenario: Injeção de drift preservando semente determinística
- **WHEN** a rotina de simulação de drift processa o dataset de produção-base
- **THEN** o sistema grava `data/production/production.csv` com distribuições estatisticamente deslocadas para `Credit amount`, `Age` e `Checking account`

#### Scenario: Padrões reproduzem o cenário oficial
- **WHEN** a simulação é executada sem parâmetros
- **THEN** o dataset gerado é idêntico ao do cenário oficial para a mesma semente

#### Scenario: Simulação sem choque
- **WHEN** a simulação recebe inflação 1.0, ruído 0, deslocamento de idade 0 e nenhuma redistribuição de `Checking account`
- **THEN** as distribuições de produção permanecem iguais às da produção-base
