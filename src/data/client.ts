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
