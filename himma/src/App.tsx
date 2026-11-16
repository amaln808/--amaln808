import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { CalendarCheck, ChartColumn, ListChecks, LogOut, ScrollText, Target, WifiOff } from 'lucide-react'
import { errorText, isConfigured, supabase } from './data/client'
import { DataProvider, useStore } from './data/store'
import { Button, ErrorText, Field, Input } from './components/ui'
import { TodayPage } from './pages/TodayPage'
import { TasksPage } from './pages/TasksPage'
import { GoalsPage } from './pages/GoalsPage'
import { PerformancePage } from './pages/PerformancePage'
import { LogPage } from './pages/LogPage'

const NAV = [
  { to: '/', label: 'اليوم', icon: CalendarCheck },
  { to: '/tasks', label: 'المهام', icon: ListChecks },
  { to: '/goals', label: 'الأهداف', icon: Target },
  { to: '/performance', label: 'الأداء', icon: ChartColumn },
  { to: '/log', label: 'الإنجازات', icon: ScrollText },
]

export function App() {
  if (!isConfigured) return <NotConfigured />
  return <Gate />
}

function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <div className={big ? 'text-center' : ''}>
      <div className={`font-bold leading-none tracking-tight ${big ? 'text-6xl' : 'text-3xl'}`}>الهمة</div>
      <div className={`mt-1 text-on-brand/70 ${big ? 'text-base' : 'text-xs'}`}>مهامي وأهدافي</div>
    </div>
  )
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-brand px-4 py-10 text-on-brand">
      <div className="w-full max-w-sm">
        <Wordmark big />
        <div className="mt-10">{children}</div>
      </div>
    </div>
  )
}

function NotConfigured() {
  return (
    <Splash>
      <p className="rounded-2xl bg-card p-5 text-center leading-relaxed text-ink">
        التطبيق جاهز وينتظر ربطه بقاعدة البيانات. بعد إنشاء مشروع Supabase وإرسال رابطه ومفتاحه العام سيظهر هنا تسجيل الدخول.
      </p>
    </Splash>
  )
}

function Gate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <div className="min-h-dvh bg-brand" />
  if (!session) return <Login />
  return (
    <DataProvider>
      <HashRouter>
        <Layout />
      </HashRouter>
    </DataProvider>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(errorText(error))
    setBusy(false)
  }
  return (
    <Splash>
      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-card p-5 text-ink">
        <Field label="البريد الإلكتروني">
          <Input type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="كلمة المرور">
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'جارٍ الدخول…' : 'دخول'}
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Splash>
  )
}

function Layout() {
  const { offline } = useStore()
  const signOut = () => {
    if (confirm('تسجيل الخروج من الهمة على هذا الجهاز؟')) {
      localStorage.removeItem('himma-cache')
      void supabase!.auth.signOut()
    }
  }
  return (
    <div className="min-h-dvh md:flex">
      {/* Side rail on the iPad and computer */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-brand px-4 py-6 text-on-brand md:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium ${isActive ? 'bg-on-brand text-brand' : 'text-on-brand/80 hover:bg-white/10'}`
              }
            >
              <Icon size={20} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={signOut} className="mt-auto flex min-h-11 items-center gap-3 rounded-xl px-3 text-on-brand/70 hover:bg-white/10">
          <LogOut size={18} aria-hidden />
          خروج
        </button>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-10">
        <header className="flex items-center justify-between bg-brand px-4 py-3 text-on-brand md:hidden">
          <Wordmark />
          <button type="button" onClick={signOut} aria-label="خروج" className="grid size-11 place-items-center rounded-xl hover:bg-white/10">
            <LogOut size={20} />
          </button>
        </header>
        {offline && (
          <p className="flex items-center gap-2 bg-saffron-soft px-4 py-2 text-sm text-ink">
            <WifiOff size={16} aria-hidden /> لا يوجد اتصال — تظهر آخر بيانات محفوظة على الجهاز، والحفظ يحتاج اتصالاً.
          </p>
        )}
        <main className="mx-auto max-w-4xl px-4 pt-5 md:px-8 md:pt-8">
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/performance" element={<PerformancePage />} />
            <Route path="/log" element={<LogPage />} />
          </Routes>
        </main>
      </div>

      {/* Bottom bar on the phone */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? 'font-bold text-button' : 'text-muted'}`}
          >
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
