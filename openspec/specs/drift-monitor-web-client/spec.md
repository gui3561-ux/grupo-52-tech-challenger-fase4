# drift-monitor-web-client Specification

## Purpose

Interface web que opera o pipeline de Credit Scoring e visualiza o drift consumindo a Credit Scoring MLOps API.

## Requirements

### Requirement: Operação do pipeline
A interface SHALL listar as etapas do pipeline com status e resultado da última execução, permitir executar uma etapa pronta e iniciar o pipeline completo, acompanhando o job até o fim.

#### Scenario: Etapa bloqueada
- **WHEN** uma etapa tem arquivos de entrada ausentes
- **THEN** ela aparece como bloqueada, com os arquivos que faltam, e o botão de execução fica desabilitado

#### Scenario: Pipeline completo
- **WHEN** o usuário inicia o pipeline completo
- **THEN** a interface acompanha o job, mostra o resumo e a run do MLflow ao final e atualiza os painéis

### Requirement: Simulação de drift parametrizada
A interface SHALL oferecer cenários prontos e controles para cada parâmetro da simulação e, ao aplicar, simular, validar o lote no contrato e recalcular a detecção.

#### Scenario: Lote barrado pelo contrato
- **WHEN** a simulação gera registros que violam o contrato Pandera
- **THEN** a interface mostra o total de violações e exemplos, sem executar a detecção

### Requirement: Diagnóstico e visualização do drift
A interface SHALL exibir os indicadores de Data Drift e Concept Drift da última detecção, o PSI por feature com os limiares e a distribuição Referência × Produção da feature selecionada, cada gráfico com tabela equivalente.

#### Scenario: Detecção desatualizada
- **WHEN** a referência, o modelo ou a produção mudam depois da última detecção
- **THEN** os indicadores são marcados como desatualizados

#### Scenario: Dados ausentes para visualizar
- **WHEN** ainda não existem Referência e Produção com drift
- **THEN** a interface orienta quais etapas executar em vez de mostrar um erro genérico
