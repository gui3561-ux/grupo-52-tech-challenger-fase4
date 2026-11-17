## Context

As etapas do pipeline trocam dados por arquivos com caminhos relativos (`data/`, `models/`, `reports/`, ver `src/credit/config.py`). A API reaproveita essas funções sem duplicar regra de negócio.

## Goals / Non-Goals

**Goals:**
- Expor simulação parametrizada, detecção, visualização, pipeline completo e etapas isoladas.
- Orientar quem executa etapas fora de ordem (quais etapas rodar antes).

**Non-Goals:**
- Autenticação, persistência de jobs, fila de execuções e deploy (Docker/compose) da API.
- Endpoint de inferência ou validação de lotes enviados pelo cliente.

## Decisions

### 1. Uma execução por vez, recusando as concorrentes (409)
- **Decisão:** um `threading.Lock` por app protege etapas, simulação, detecção e pipeline; quem chega com o lock ocupado recebe 409.
- **Justificativa:** todas as etapas gravam nos mesmos arquivos; execuções simultâneas se corromperiam. Recusar em vez de enfileirar mantém o comportamento previsível e simples.

### 2. Etapas síncronas, pipeline completo em background
- **Decisão:** etapas, simulação e detecção respondem na mesma requisição; `POST /pipeline/runs` devolve 202 com um job consultável.
- **Justificativa:** medidas locais: cada etapa leva menos de 1 s (treino ~0,6 s, Evidently ~0,5 s). O pipeline completo inclui o registro no MLflow e é a operação que o usuário "inicia e acompanha".

### 3. Pré-requisitos declarados por etapa
- **Decisão:** cada etapa declara os arquivos de entrada (atributos de `config`, resolvidos na hora); a ausência gera 409 com `missing` e `run_first`.
- **Justificativa:** sem isso, quem roda fora de ordem recebe um `FileNotFoundError` com dica de CLI, sem saber qual etapa da API executar.

### 4. Histórico em memória
- **Decisão:** última execução por etapa e jobs do pipeline ficam em memória do processo.
- **Justificativa:** o registro durável das runs já é o MLflow (`result.run_id`). Reiniciar a API limpa o histórico.

### 5. Visualização = Evidently + dados para gráfico
- **Decisão:** servir o HTML do Evidently e um endpoint JSON com as proporções por faixa/categoria na mesma discretização do PSI.
- **Justificativa:** o HTML cobre a análise visual completa; o JSON permite a um cliente plotar exatamente o que o PSI compara.

## Risks / Trade-offs

- **[Leituras durante escrita]** → `GET /drift/distributions` e `GET /drift/report` não usam o lock e podem ler um arquivo sendo regravado. Aceitável numa API de demonstração.
- **[Diretório de trabalho]** → a API precisa rodar a partir da raiz do projeto (caminhos relativos).
