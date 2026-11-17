# credit-drift-api Specification

## Purpose

API HTTP para simular, detectar e visualizar data drift e para executar o pipeline de Credit Scoring e suas etapas.

## Requirements

### Requirement: Simulação de drift parametrizada
A API SHALL gerar o dataset de produção com drift a partir de parâmetros opcionais (inflação, ruído, deslocamento de idade, distribuição de `Checking account`, semente) e devolver o antes × depois das variáveis alteradas.

#### Scenario: Simulação com o cenário oficial
- **WHEN** `POST /drift/simulate` é chamado sem corpo após o split
- **THEN** a API grava o dataset de produção com o choque oficial e devolve média/mediana antes e depois das numéricas e as proporções da categórica

#### Scenario: Parâmetros inválidos
- **WHEN** a distribuição de `Checking account` contém categoria fora do contrato, peso negativo ou soma zero
- **THEN** a API responde 422 sem executar a simulação

### Requirement: Detecção de Data Drift e Concept Drift
A API SHALL calcular PSI/KS por feature, apontar as features com PSI ≥ 0.25, comparar o desempenho de holdout com o de produção e regravar os relatórios do Evidently.

#### Scenario: Drift detectado
- **WHEN** `POST /drift/detect` é chamado após treino e simulação
- **THEN** a resposta traz as estatísticas por feature, as features críticas, a queda de ROC-AUC e se ela excede o limiar de alerta

### Requirement: Visualização do drift
A API SHALL servir o relatório HTML do Evidently e as distribuições Referência × Produção por feature, na mesma discretização usada pelo PSI.

#### Scenario: Relatório ainda não gerado
- **WHEN** `GET /drift/report` é chamado antes de qualquer detecção
- **THEN** a API responde 404 indicando `POST /drift/detect`

#### Scenario: Distribuições para gráfico
- **WHEN** `GET /drift/distributions` é chamado com Referência e Produção disponíveis
- **THEN** cada feature traz PSI, veredito e a proporção de cada faixa ou categoria nos dois datasets

### Requirement: Execução de etapas isoladas
A API SHALL listar as etapas do pipeline com seus pré-requisitos e executar uma etapa por vez, recusando a execução quando faltar algum arquivo de entrada.

#### Scenario: Etapa fora de ordem
- **WHEN** uma etapa é executada sem os arquivos produzidos por etapas anteriores
- **THEN** a API responde 409 com os arquivos ausentes e as etapas a executar antes

#### Scenario: Lote de produção viola o contrato
- **WHEN** a etapa `production_ingestion_gate` encontra registros inválidos
- **THEN** a API responde 422 com as violações e registra a execução da etapa como falha

### Requirement: Pipeline completo em background
A API SHALL iniciar o pipeline completo de forma assíncrona e permitir acompanhar o job até o resultado, incluindo o `run_id` do MLflow.

#### Scenario: Pipeline iniciado e concluído
- **WHEN** `POST /pipeline/runs` é chamado sem outra execução em andamento
- **THEN** a API responde 202 com o job e, ao final, `GET /pipeline/runs/{id}` mostra status `succeeded` e o resumo da run

#### Scenario: Execução concorrente
- **WHEN** uma etapa, simulação, detecção ou pipeline é solicitado enquanto outra execução está em andamento
- **THEN** a API responde 409 sem iniciar a nova execução
