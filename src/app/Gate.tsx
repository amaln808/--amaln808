import { Eye, EyeOff, LockKeyhole, Plug } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Button } from '../components/ui'
import { Field, FormError, TextInput } from '../components/form'
import { useAuth } from '../data/auth'
import { t } from '../i18n/index'
import { LanguageToggle } from './LanguageToggle'
import { LogoMark } from './Layout'

/**
 * Full-screen frame for everything before the app: the brand panel carries the
 * large calligraphic mark, the other side holds the form or message.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <div className="flex flex-col items-center justify-center gap-4 bg-rail px-6 py-10 text-on-rail md:w-[44%] md:py-0">
        <LogoMark className="h-40 w-20 md:h-[58vh] md:w-[29vh]" />
        <p className="max-w-[16rem] text-center text-sm leading-relaxed opacity-80">
          {t('معجون التمر بزبدة الفول السوداني', 'Date paste with peanut butter')}
        </p>
      </div>
      <div className="flex flex-1 flex-col px-6 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <LanguageToggle className="text-muted hover:bg-brand-50" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">{children}</div>
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center text-brand-800">
      <LogoMark className="h-24 w-12 animate-pulse" />
    </div>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame>
      <h1 className="text-2xl font-bold">{t('تسجيل الدخول', 'Sign in')}</h1>
      <p className="mt-1 text-muted">{t('بياناتك محمية ولا يراها غيرك.', 'Your data is private to your account.')}</p>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <Field label={t('البريد الإلكتروني', 'Email')}>
          <TextInput
            type="email"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('كلمة المرور', 'Password')}>
          <div className="relative">
            <TextInput
              type={show ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pe-12"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-muted"
              aria-label={show ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>
        <FormError message={error} />
        <Button type="submit" disabled={busy} className="mt-2 min-h-12">
          <LockKeyhole className="size-5" />
          {busy ? t('جارٍ الدخول…', 'Signing in…') : t('دخول', 'Sign in')}
        </Button>
      </form>
    </Frame>
  )
}

export function NotMemberScreen() {
  const { session, signOut } = useAuth()
  return (
    <Frame>
      <h1 className="text-2xl font-bold">{t('هذا الحساب غير مصرّح له', 'This account has no access')}</h1>
      <p className="mt-3 leading-relaxed text-muted">
        {t(
          `الحساب ${session?.user.email ?? ''} مسجّل، لكنه ليس من أعضاء زوردة، لذلك لا يرى أي بيانات.`,
          `${session?.user.email ?? ''} is signed in but is not a Zawrda member, so it can't see any data.`,
        )}
      </p>
      <Button variant="secondary" className="mt-8" onClick={signOut}>
        {t('تسجيل الخروج', 'Sign out')}
      </Button>
    </Frame>
  )
}

/** Shown until the Supabase address and key are added to src/data/supabase.config.json. */
export function SetupScreen() {
  return (
    <Frame>
      <div className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-brand-800">
        <Plug className="size-7" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">{t('بانتظار ربط قاعدة البيانات', 'Waiting for the database link')}</h1>
      <p className="mt-3 leading-relaxed text-muted">
        {t(
          'النسخة الجديدة جاهزة، وتحتاج فقط عنوان مشروع Supabase ومفتاحه العام. بعد إضافتهما تظهر هنا شاشة تسجيل الدخول.',
          'The new version is ready and only needs the Supabase project address and public key. Once added, the sign-in screen appears here.',
        )}
      </p>
    </Frame>
  )
}
