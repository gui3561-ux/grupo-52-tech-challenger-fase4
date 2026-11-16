# Frontend — Monitor de Drift (Credit Scoring)

Interface React + TypeScript (Vite) para a API FastAPI de `src/api/` (Tech Challenge Fase 4).

- **Pipeline:** as 7 etapas em ordem, com o status de cada uma (concluída, bloqueada, falhou), o resultado
  da última execução e um botão para rodar a etapa isolada. **Executar pipeline completo** dispara o job em
  background, acompanha o andamento e mostra a run do MLflow ao final.
- **Simulação de drift:** cenários prontos (*Sem choque*, *Oficial*, *Severo*) e controles para inflação do
  crédito, ruído, rejuvenescimento da base e a redistribuição de `Checking account`. **Aplicar simulação** segue
  a ordem do pipeline: simula, valida o lote no contrato Pandera e recalcula a detecção. Mostra o antes × depois.
- **Diagnóstico:** indicadores de Data Drift (features com PSI ≥ 0,25) e Concept Drift (ROC-AUC e acurácia em
  produção contra o holdout, alerta de desempenho). Ficam marcados como *desatualizados* se a referência, o
  modelo ou a produção mudarem depois da detecção.
- **Visualização:** PSI por feature em barras ranqueadas, com as réguas de 0,10 e 0,25. Selecionar uma feature
  mostra a distribuição Referência × Produção, na mesma discretização usada no PSI. Cada gráfico tem tabela.
- **Relatório Evidently:** abre em nova aba ou embutido na página.

## Executar

Requer Node ≥ 22.12 e a API rodando na raiz do projeto:

```bash
uv run uvicorn src.api.main:app --port 8000   # na raiz do projeto
```

```bash
cd client
npm ci
npm run dev        # http://localhost:5173
npm test           # testes unitários (Vitest)
npm run build      # typecheck + build em dist/
npm run preview    # serve o build, também com proxy
```

Fluxo sugerido na tela: **Executar pipeline completo** (ou as etapas *Split* e *Treino*), depois ajustar o
cenário em **Simulação de drift** e **Aplicar simulação**. Para ver o contrato barrando um lote, aumente o ruído
para σ ≥ 0,30.

## Comunicação com a API

A API não habilita CORS, então o browser não pode chamá-la direto de outra origem. O frontend chama `/api/*`
e o Vite (em `dev` e `preview`) repassa para a API, removendo o prefixo (`/api/drift/detect` → `/drift/detect`).
O relatório do Evidently é embutido pela mesma origem (`/api/drift/report`).

| Variável | Padrão | Uso |
|---|---|---|
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Destino do proxy do Vite |
| `VITE_API_BASE_URL` | `/api` | Base usada pelo browser. Só aponte direto para a API se ela tiver CORS |

Veja `.env.example`. Para publicar o `dist/` em outro host é preciso um proxy reverso para a API ou CORS no
backend.

A API executa uma operação por vez: enquanto algo roda, os botões ficam desabilitados. Um `409` vindo de outra
aba ou cliente aparece como erro no painel que disparou a ação.

## Contrato

`src/api/types.ts` espelha os schemas Pydantic de `src/api/schemas.py` (`GET /openapi.json`). Os erros da API
são traduzidos em `src/api/client.ts`:

| Resposta | Mensagem exibida |
|---|---|
| `409` com `run_first` | "Faltam resultados de etapas anteriores" + etapas a executar antes e arquivos ausentes |
| `409` com texto | o texto (ex.: execução em andamento) |
| `422` do contrato Pandera | total de violações + as 5 primeiras |
| `422` do Pydantic | erro por campo |

Ao mudar a API, atualize esses tipos.

## Visual

Os gráficos seguem a paleta de referência da skill de dataviz, validada para daltonismo e contraste nos modos
claro e escuro. Os slots 1–4 identificam Referência/Produção e as categorias de `Checking account`; a cor segue
a entidade e nunca muda com filtros. Cor de status sempre acompanha ícone e texto. Os tokens ficam no topo de
`src/index.css`.

## Lockfile

O repositório é público: `package-lock.json` deve apontar só para `https://registry.npmjs.org/`.
Se você instala por um mirror (ex.: `NPM_CONFIG_REGISTRY` corporativo), troque as URLs do mirror por
`https://registry.npmjs.org/` antes de commitar. O npm redireciona para o registry configurado na
instalação (`replace-registry-host=npmjs`, padrão), então o lock continua funcionando com o mirror.
