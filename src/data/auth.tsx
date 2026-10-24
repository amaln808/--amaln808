import type { Session } from '@supabase/supabase-js'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { t } from '../i18n/index'
import { isNetworkError, supabase } from './client'
import { clearLocal } from './local'

export type AuthStatus = 'loading' | 'signedOut' | 'notMember' | 'ready'

interface AuthState {
  status: AuthStatus
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Remembers that this account was a member, so the app still opens offline. */
const MEMBER_KEY = 'zawrda-member'

async function checkMember(userId: string): Promise<boolean> {
  const { data, error } = await supabase!.from('members').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) {
    if (isNetworkError(error) && localStorage.getItem(MEMBER_KEY) === userId) return true
    throw error
  }
  if (data) localStorage.setItem(MEMBER_KEY, userId)
  else localStorage.removeItem(MEMBER_KEY)
  return Boolean(data)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    if (!supabase) return
    const apply = async (s: Session | null) => {
      setSession(s)
      if (!s) return setStatus('signedOut')
      try {
        setStatus((await checkMember(s.user.id)) ? 'ready' : 'notMember')
      } catch {
        setStatus(localStorage.getItem(MEMBER_KEY) === s.user.id ? 'ready' : 'notMember')
      }
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      // Token refreshes keep the same user; only re-check on real changes
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') void apply(s)
      else setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (isNetworkError(error)) throw new Error(t('لا يوجد اتصال بالإنترنت.', 'No internet connection.'))
      if (/invalid login credentials/i.test(error.message))
        throw new Error(t('البريد أو كلمة المرور غير صحيحة.', 'Wrong email or password.'))
      if (/rate limit|too many/i.test(error.message))
        throw new Error(t('محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مجدداً.', 'Too many attempts. Wait a moment and try again.'))
      throw new Error(error.message)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase!.auth.signOut().catch(() => {})
    localStorage.removeItem(MEMBER_KEY)
    await clearLocal().catch(() => {})
  }, [])

  return <AuthContext.Provider value={{ status, session, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
