import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import config from './supabase.config.json'

/**
 * Supabase connection. The URL and publishable (anon) key are public by design —
 * every table is protected by row level security — so they live in the repo.
 * The secret key never does. VITE_SUPABASE_URL / VITE_SUPABASE_KEY override them for local testing.
 */
const url: string = import.meta.env.VITE_SUPABASE_URL || config.url
const key: string = import.meta.env.VITE_SUPABASE_KEY || config.publishableKey

export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'zawrda-auth' },
    })
  : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** True when an error means "could not reach the server" rather than "the server said no". */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String((err as { message?: string })?.message ?? err)
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|timeout/i.test(msg)
}

/** Rows per request: Supabase answers at most 1000 rows to a single query. */
export const PAGE_SIZE = 1000

interface Pageable {
  order(column: string, options?: { ascending?: boolean }): Pageable
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
}

/**
 * Every row of a list query, however many there are. A plain select stops at
 * 1000 rows without any error, so once a table grows past that, totals and lists
 * would silently miss records. This asks page by page (ordered by `key` last, so
 * pages never overlap) until a page comes back short.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function all<T = any>(make: () => unknown, key = 'id'): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (make() as Pageable).order(key).range(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
