import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import config from '../supabase.config.json'

/**
 * Connection to الهمة's own Supabase project (separate from Zuwardah's).
 * The URL and publishable key are public by design: row level security lets each
 * signed-in user see only their own rows. VITE_HIMMA_URL / VITE_HIMMA_KEY override them locally.
 */
const url: string = import.meta.env.VITE_HIMMA_URL || config.url
const key: string = import.meta.env.VITE_HIMMA_KEY || config.publishableKey

export const isConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'himma-auth' } })
  : null

export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

/** Arabic part of a server message ('عربي | English'), or a plain explanation for network failures. */
export function errorText(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err)
  if (/Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg) || navigator.onLine === false)
    return 'لا يوجد اتصال بالإنترنت. حاولي مرة أخرى بعد عودة الاتصال.'
  if (/Invalid login credentials/i.test(msg)) return 'البريد أو كلمة المرور غير صحيحة.'
  return msg.split(' | ')[0]
}
