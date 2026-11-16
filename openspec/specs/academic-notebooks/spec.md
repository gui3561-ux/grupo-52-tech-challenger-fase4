# academic-notebooks Specification

## Purpose

Oferece o notebook acadêmico de exploração dos dados de crédito e a documentação de entrega do Tech Challenge Fase 4 (Credit Scoring com MLOps).

## Requirements

### Requirement: Identidade e recorte da entrega
O README SHALL identificar o grupo da entrega, os integrantes (RM e nome) e o recorte do problema: o modelo de Credit Scoring de uma fintech de concessão de crédito, em produção, sob suspeita de degradação silenciosa após mudanças na economia (inflação, novos perfis de clientes).

#### Scenario: Avaliador reconhece o recorte
- **WHEN** um avaliador abre o README
- **THEN** encontra o grupo da entrega, o caso da fintech com degradação silenciosa e o dataset usado (German Credit ampliado para 5.000 registros)

#### Scenario: Integrantes visíveis
- **WHEN** um avaliador procura quem entregou o trabalho
- **THEN** o README lista RM371323 Guilherme Ramos Couceiro, RM372947 Lucas Ribeiro Pestana, RM373551 Sávio Aparecido Crispim, RM373555 Wesley Oliveira e RM373529 Cristiano Santos de Oliveira

### Requirement: Notebook de exploração de crédito e governança
O repositório SHALL incluir um notebook acadêmico (`notebooks/03_eda_german_credit.ipynb`) dedicado à exploração dos dados de crédito, desbalanceamento de classes, levantamento de atributos sensíveis (LGPD) e prévia visual do drift.

#### Scenario: Análise de estrutura e desbalanceamento do target
- **WHEN** o notebook de exploração de crédito é executado após a geração dos dados
- **THEN** ele apresenta a distribuição do target `Risk` (~70% good e ~30% bad), detalha as variáveis categóricas e numéricas e justifica o foco em métricas além da acurácia

#### Scenario: Levantamento de atributos sensíveis e potenciais vieses
- **WHEN** o leitor percorre a seção de governança do notebook
- **THEN** são apresentadas análises comparativas de taxa de inadimplência por gênero (`Sex`) e faixa de idade (`Age`), destacando riscos de viés algorítmico e conformidade com LGPD

#### Scenario: Visualização gráfica das distribuições com drift
- **WHEN** os conjuntos de referência e produção estão gerados
- **THEN** o notebook plota gráficos de densidade e frequência comparando as distribuições de `Age`, `Credit amount` e `Checking account` entre o ambiente de referência e produção

### Requirement: Documentação de entrega e guia operacional no README
O `README.md` SHALL consolidar a visão geral do Tech Challenge Fase 4 e o guia de execução de todas as etapas operacionais (Etapa 1 a 4).

#### Scenario: Instruções de execução das 4 etapas
- **WHEN** um usuário clona o projeto e lê o README
- **THEN** ele é capaz de reproduzir os comandos da Etapa 1 (Pandera), Etapa 2 (Drift), Etapa 3 (MLflow) e consultar os relatórios gerados
