## 1. Projeto

- [x] 1.1 Criar `client/` com Vite + React + TypeScript e proxy `/api`
- [x] 1.2 Garantir `package-lock.json` apontando para `registry.npmjs.org`

## 2. Contrato e cliente HTTP

- [x] 2.1 Tipos do OpenAPI em `client/src/api/types.ts`
- [x] 2.2 Cliente `fetch` com tratamento de 422, 500/503 e falha de rede
- [x] 2.3 Parser da janela de preços e do formato Prometheus, com testes (Vitest)

## 3. Interface

- [x] 3.1 Painel de status (`/health`, `/ready`)
- [x] 3.2 Formulário de previsão, resultado e gráfico da janela + D+1
- [x] 3.3 Painel de métricas (`/metrics`)

## 4. Documentação e verificação

- [x] 4.1 `client/README.md` e referência no README principal
- [x] 4.2 Build, typecheck e testes; contrato verificado contra a API local
- [ ] 4.3 Validação visual no browser (`npm run dev`)
