import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// A API FastAPI não habilita CORS. Em dev/preview o browser fala só com o Vite,
// que repassa `/api/*` para a API — por isso o frontend usa `/api` como base.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8000'
  const proxy = {
    '/api': {
      target,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
  }

  return {
    plugins: [react()],
    define: { __API_PROXY_TARGET__: JSON.stringify(target) },
    server: { proxy },
    preview: { proxy },
    test: { environment: 'node' },
  }
})
