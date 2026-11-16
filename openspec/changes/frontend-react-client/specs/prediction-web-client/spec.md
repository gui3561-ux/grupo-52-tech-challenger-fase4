## ADDED Requirements

### Requirement: Previsão D+1 pela interface web
O frontend SHALL permitir ao usuário informar 60 fechamentos e enviá-los ao `POST /predict` no formato `{"prices": number[]}`, exibindo `ticker`, `horizon` e `predicted_close` da resposta.

#### Scenario: Janela válida exibe previsão
- **WHEN** o usuário informa 60 números finitos e envia
- **THEN** o frontend exibe o fechamento previsto, o ticker, o horizonte e a variação em relação ao último fechamento informado

#### Scenario: Janela inválida é barrada antes do envio
- **WHEN** o usuário informa quantidade diferente de 60 ou valores não numéricos
- **THEN** o frontend indica o problema e não envia a requisição

#### Scenario: Erro de validação da API
- **WHEN** a API responde 422 com `HTTPValidationError`
- **THEN** o frontend exibe as mensagens de cada `ValidationError`

#### Scenario: Modelo indisponível ou falha interna
- **WHEN** a API responde 503 ou 500 com `detail`
- **THEN** o frontend exibe a mensagem recebida sem quebrar a interface

### Requirement: Status e métricas do serviço
O frontend SHALL exibir o estado de `/health` e `/ready` e as métricas de `/metrics` (total de previsões, latência média, CPU e memória).

#### Scenario: Modelo não pronto
- **WHEN** `/ready` responde 503 com `{"status": "not_ready"}`
- **THEN** o frontend sinaliza que o modelo não está pronto

#### Scenario: API inacessível
- **WHEN** a API não responde
- **THEN** o frontend informa que não conseguiu conectar à API
