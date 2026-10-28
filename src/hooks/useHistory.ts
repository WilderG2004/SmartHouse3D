import { useEffect, useState } from 'react'
import { HistoryAuthError, RANGE_MINUTES } from '../services/history/historyApi'
import { useSessionStore } from '../store/useSessionStore'
import { useUiStore } from '../store/useUiStore'

export interface HistoryState<T> {
  range: ReturnType<typeof useUiStore.getState>['historyRange']
  data: T[] | null
  loading: boolean
  error: string | null
  /** true = el error es de autorización (falta emparejar): `error` trae el texto para mostrar */
  authNeeded: boolean
}

/**
 * Descarga una serie del historial (InfluxDB vía Node-RED) cuando el rango no es «en vivo»
 * y la refresca cada 10 s. `deps` = lo que hace cambiar la consulta (p. ej. la habitación).
 * Se vuelve a pedir al emparejar o cerrar la sesión (el historial exige la clave de esta pantalla).
 */
export function useRangeData<T>(fetcher: (minutes: number) => Promise<T[]>, deps: unknown[] = []): HistoryState<T> {
  const range = useUiStore((s) => s.historyRange)
  const user = useSessionStore((s) => s.user)
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authNeeded, setAuthNeeded] = useState(false)

  useEffect(() => {
    if (range === 'live') {
      setData(null)
      setError(null)
      setAuthNeeded(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const rows = await fetcher(RANGE_MINUTES[range])
        if (!cancelled) {
          setData(rows)
          setError(null)
          setAuthNeeded(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error')
          setAuthNeeded(e instanceof HistoryAuthError)
          if (e instanceof HistoryAuthError) setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, user, ...deps])

  return { range, data, loading, error, authNeeded }
}
