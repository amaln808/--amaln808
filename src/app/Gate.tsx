import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, Plug } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Button } from '../components/ui'
import { Field, FormError, Textarea, TextInput } from '../components/form'
import { resetWithLink, sendPasswordReset, useAuth } from '../data/auth'
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
        <div className="text-xl font-semibold tracking-[0.25em]" dir="ltr">Zuwardah</div>
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

/** A password box with a show / hide button. */
function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <TextInput type={show ? 'text' : 'password'} dir="ltr" autoComplete={autoComplete} required value={value} onChange={(e) => onChange(e.target.value)} className="pe-12" />
      <button
        type="button"
        onClick={() => setShow((x) => !x)}
        className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-muted"
        aria-label={show ? t('إخفاء كلمة المرور', 'Hide password') : t('إظهار كلمة المرور', 'Show password')}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  )
}

/**
 * Forgotten password: an email with a reset link, then the link pasted here with
 * a new password. Pasting (rather than opening the link) works on any address
 * the app is served from.
 */
function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [link, setLink] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (e: FormEvent, task: () => Promise<void>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame>
      <h1 className="text-2xl font-bold">{t('نسيت كلمة المرور', 'Forgot password')}</h1>
      {!sent ? (
        <form onSubmit={(e) => run(e, async () => (await sendPasswordReset(email), setSent(true)))} className="mt-6 flex flex-col gap-4">
          <p className="text-muted">{t('تصل رسالة إلى بريد الحساب فيها رابط لتعيين كلمة مرور جديدة.', 'An email with a link to set a new password is sent to the account address.')}</p>
          <Field label={t('البريد الإلكتروني', 'Email')}>
            <TextInput type="email" dir="ltr" autoComplete="username" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <FormError message={error} />
          <Button type="submit" disabled={busy} className="mt-2 min-h-12">
            <Mail className="size-5" />
            {busy ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال الرابط', 'Send the link')}
          </Button>
          <button type="button" onClick={() => setSent(true)} className="text-sm text-brand-800 underline">
            {t('وصلتني الرسالة من قبل', 'I already have the email')}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => run(e, () => resetWithLink(link, password))} className="mt-6 flex flex-col gap-4">
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
            <li>{t('في البريد: رسالة «Reset Your Password» (وفي «غير المرغوب» إن لم تظهر).', 'Open the email «Reset Your Password» (check spam too).')}</li>
            <li>{t('دون فتح الرابط: ضغطة مطولة عليه ثم «نسخ الرابط».', "Don't open the link: press and hold it, then «Copy link».")}</li>
            <li>{t('يُلصق الرابط هنا، وتُكتب كلمة المرور الجديدة.', 'Paste it here and type the new password.')}</li>
          </ol>
          <Field label={t('الرابط من الرسالة', 'Link from the email')}>
            <Textarea dir="ltr" required value={link} onChange={(e) => setLink(e.target.value)} rows={3} />
          </Field>
          <Field label={t('كلمة المرور الجديدة (8 خانات على الأقل)', 'New password (at least 8 characters)')}>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
          </Field>
          <FormError message={error} />
          <Button type="submit" disabled={busy || password.length < 8} className="mt-2 min-h-12">
            <KeyRound className="size-5" />
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ كلمة المرور والدخول', 'Save password and sign in')}
          </Button>
          <button type="button" onClick={() => setSent(false)} className="text-sm text-brand-800 underline">
            {t('إرسال رسالة جديدة', 'Send a new email')}
          </button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mt-6 text-sm text-muted underline">
        {t('رجوع لتسجيل الدخول', 'Back to sign in')}
      </button>
    </Frame>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [forgot, setForgot] = useState(false)
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

  if (forgot) return <ForgotPassword initialEmail={email} onBack={() => setForgot(false)} />

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
        <button type="button" onClick={() => setForgot(true)} className="text-sm text-brand-800 underline">
          {t('نسيت كلمة المرور؟', 'Forgot password?')}
        </button>
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
          `${session?.user.email ?? ''} is signed in but is not a Zuwardah member, so it can't see any data.`,
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
