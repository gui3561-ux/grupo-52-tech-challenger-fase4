## MODIFIED Requirements

### Requirement: Contrato de dados com Pandera para controle de qualidade
O pipeline de dados SHALL validar as instâncias do dataset de crédito contra um schema formal do Pandera (`DataFrameSchema`), impondo regras rígidas de integridade: tipos de dados corretos, limites numéricos (`Age >= 18` e `<= 120`, `Credit amount > 0`, `Duration > 0`), domínios categóricos válidos para `Sex`, `Job`, `Housing`, `Saving accounts`, `Checking account`, `Purpose` e `Risk`, ausência de valores nulos nas colunas obrigatórias e ausência de registros duplicados nas features.

#### Scenario: Dataset válido é aprovado pelo contrato
- **WHEN** o dataset pré-processado contendo valores conformes é submetido à validação de esquema
- **THEN** o contrato do Pandera valida com sucesso e devolve o dataframe inalterado sem levantar exceções

#### Scenario: Violações de esquema disparam erro estruturado e detalhado
- **WHEN** um conjunto de dados violar uma ou mais restrições do contrato (ex.: idade menor que 18 ou nulos em colunas obrigatórias)
- **THEN** o validador interrompe o processamento e emite uma exceção contendo a listagem analítica das colunas, índices e valores que falharam na checagem

#### Scenario: Registros duplicados são rejeitados
- **WHEN** um lote contiver dois ou mais registros com as mesmas features
- **THEN** o validador levanta `DataContractViolationError` apontando os registros duplicados

## ADDED Requirements

### Requirement: Validação do dataset de Produção antes da predição
O pipeline SHALL validar o dataset de Produção (com drift) contra o mesmo contrato de dados antes de gerar predições ou relatórios de drift.

#### Scenario: Produção inválida bloqueia a detecção
- **WHEN** o dataset de Produção violar o contrato
- **THEN** o pipeline é interrompido antes da predição e a falha é registrada
