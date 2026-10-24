import { useCallback, useEffect, useRef, useState } from 'react'
import { isNetworkError } from './client'
import { local } from './local'

const listeners = new Set<(key: string) => void>()

/** Tells every open query whose key starts with `prefix` to reload (call after saving). */
export function invalidate(prefix: string) {
  listeners.forEach((fn) => fn(prefix))
}

export interface QueryState<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  /** Showing the copy saved on this device because the server can't be reached */
  fromCache: boolean
  savedAt?: string
  refresh: () => void
}

/**
 * Loads data from Supabase and keeps the last answer on the iPad, so pages still
 * open (read-only) without internet. The cached copy shows instantly, then the
 * fresh one replaces it.
 */
export function useQuery<T>(key: string, fetcher: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<Omit<QueryState<T>, 'refresh'>>({
    data: undefined,
    loading: true,
    error: null,
    fromCache: false,
  })
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    const onInvalidate = (prefix: string) => key.startsWith(prefix) && refresh()
    listeners.add(onInvalidate)
    return () => void listeners.delete(onInvalidate)
  }, [key, refresh])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = await local.queries.get(key).catch(() => undefined)
      if (!cancelled && cached) {
        setState((s) => (s.data === undefined ? { ...s, data: cached.data as T, savedAt: cached.savedAt } : s))
      }
      try {
        const data = await fetcherRef.current()
        if (cancelled) return
        setState({ data, loading: false, error: null, fromCache: false })
        local.queries.put({ key, data, savedAt: new Date().toISOString() }).catch(() => {})
      } catch (err) {
        if (cancelled) return
        if (isNetworkError(err) && cached) {
          setState({ data: cached.data as T, loading: false, error: null, fromCache: true, savedAt: cached.savedAt })
        } else {
          setState((s) => ({ ...s, loading: false, error: String((err as Error)?.message ?? err) }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key, version])

  return { ...state, refresh }
}
