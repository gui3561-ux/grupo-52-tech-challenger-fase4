## Context

Ver `proposal.md`. A API FastAPI não registra `CORSMiddleware`; um browser em outra origem (ex.: `localhost:5173`) teria as chamadas bloqueadas.

## Decisions

- **Proxy do Vite em vez de CORS no backend**: o frontend chama `/api/*` e o Vite (dev e `preview`) repassa para `API_PROXY_TARGET` (padrão `http://127.0.0.1:8000`). Mantém a API intocada. Para servir o build estático em outra origem, será preciso habilitar CORS na API ou um proxy reverso; `VITE_API_BASE_URL` permite apontar para outra URL.
- **Contrato tipado à mão a partir do OpenAPI**: são quatro endpoints e dois schemas; um gerador de código (openapi-typescript etc.) seria dependência maior que o ganho. Os tipos ficam em `client/src/api/types.ts` com referência ao schema de origem.
- **Validação no cliente espelha a API** (exatamente 60 números finitos) só para feedback imediato; a API continua sendo a fonte da verdade e os erros 422 (`HTTPValidationError`) são exibidos campo a campo.
- **Respostas fora do OpenAPI**: `/ready` (schema vazio no Swagger) devolve `{"status": "ready"|"not_ready"}` com 200/503, e erros 500/503 de `/predict` vêm como `{"detail": string}` (`HTTPException`). O cliente trata ambos.
- **Gráfico em SVG próprio**: uma linha com 60 pontos + D+1 não justifica biblioteca de gráficos.
- **Exemplo de payload**: o botão "Carregar exemplo" importa `examples/predict_payload.json` (fonte única); o dev server libera só essa pasta via `server.fs.allow`.

## Non-Goals

- Alterar a API, adicionar CORS, autenticação ou empacotar o frontend no Docker/Render.
- Buscar preços na bolsa pelo frontend (a API recebe a janela do cliente por design).
