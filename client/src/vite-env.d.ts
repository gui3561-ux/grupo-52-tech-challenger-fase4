interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

/** Destino do proxy `/api`, injetado pelo `vite.config.ts` (usado só para exibição e link do Swagger). */
declare const __API_PROXY_TARGET__: string
