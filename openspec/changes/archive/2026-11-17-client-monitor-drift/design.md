## Context

A API executa uma operação por vez (409 para concorrentes), guarda o histórico de etapas e jobs em memória e expõe a última detecção em `GET /pipeline/stages` (`last_execution.result` da etapa `drift_detection`).

## Decisions

### 1. Estado derivado da API, não do navegador
- **Decisão:** etapas, distribuições e saúde são recarregadas após cada ação; os indicadores vêm da última detecção registrada na API.
- **Justificativa:** recarregar a página ou abrir outra aba mostra o mesmo estado. Uma detecção é marcada como *desatualizada* quando `data_split`, `model_training` ou `drift_simulation` terminaram depois dela.

### 2. "Aplicar simulação" segue a ordem do pipeline
- **Decisão:** simular → `production_ingestion_gate` → detectar, parando no primeiro erro.
- **Justificativa:** reproduz o pipeline e torna visível o bloqueio do contrato (ruído alto gera créditos ≤ 0).

### 3. Fim do pipeline recalcula a detecção
- **Decisão:** quando o job termina com sucesso, o cliente chama `POST /drift/detect`.
- **Justificativa:** o job só devolve um resumo; recalcular sobre os mesmos arquivos dá o mesmo resultado e mantém todos os painéis coerentes.

### 4. Formas dos gráficos
- PSI: barras horizontais ranqueadas em um único tom (magnitude), com réguas de 0,10 (pontilhada) e 0,25 (tracejada) explicadas na legenda; rótulos sobre as réguas colidiriam quando a escala é larga (PSI de Age ≈ 1,08).
- Distribuição: barras horizontais agrupadas (rótulos de faixa são longos), Referência e Produção nos slots 1 e 2, rótulo direto só na faixa de maior mudança.
- `Checking account` antes × depois: duas barras segmentadas altas (≤ 6 partes), fatia impressa quando cabe.
- Indicadores: stat tiles; cor de status sempre com ícone e texto.

### 5. Paleta validada
- Slots 1–4 da paleta de referência (azul, laranja, aqua, amarelo), modos claro e escuro, verificados com `validate_palette.js`: todas as checagens passam; no claro, aqua e amarelo ficam abaixo de 3:1 e exigem rótulos visíveis ou tabela, oferecidos em todos os gráficos.

## Risks / Trade-offs

- **[Sem verificação visual automatizada]** → a renderização foi verificada com respostas reais da API via `react-dom/server`; inspeção visual depende de abrir no navegador.
- **[Histórico em memória na API]** → reiniciar a API limpa etapas e jobs exibidos.
