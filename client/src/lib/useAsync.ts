import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  /** Erro da última carga (ApiError quando veio da API: status e detalhes). */
  error: Error | null
  loading: boolean
  reload: () => void
}

/**
 * Executa `load` ao montar, quando `refreshKey` muda e a cada `reload()`.
 * Mantém o último `data` durante a recarga para a tela não "piscar".
 * `load` deve ser estável (função de módulo ou memoizada).
 */
export function useAsync<T>(load: () => Promise<T>, refreshKey: unknown = null): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    load()
      .then((result) => {
        if (!active) return
        setData(result)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setData(undefined)
        setError(reason instanceof Error ? reason : new Error('Erro inesperado.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [load, refreshKey, attempt])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  return { data, error, loading, reload }
}
