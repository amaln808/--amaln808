import { useState, type ReactNode } from 'react'
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Bell, BookUser, ChartColumnBig, ClipboardCheck, Gauge, Languages, LogOut, Menu, Moon, Settings, Sparkles, Sun, SunMoon, Target, TrendingUp, Users } from 'lucide-react'
import { StoreProvider, useStore } from './data/store'
import { PrefsProvider, usePrefs } from './i18n'
import { ROLES, can, visibleEmployees } from './domain/access'
import { noticesFor } from './domain/alerts'
import type { Employee, Role } from './domain/types'
import { Avatar, Modal } from './components/ui'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { ProfilePage } from './pages/ProfilePage'
import { GoalsPage } from './pages/GoalsPage'
import { GoalPage } from './pages/GoalPage'
import { ReviewsPage } from './pages/ReviewsPage'
import { SkillsPage } from './pages/SkillsPage'
import { ReportsPage } from './pages/ReportsPage'
import { AssistantPage } from './pages/AssistantPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <PrefsProvider>
      <StoreProvider>
        <HashRouter>
          <Gate />
        </HashRouter>
      </StoreProvider>
    </PrefsProvider>
  )
}

function Gate() {
  const { me } = useStore()
  return me ? <Layout me={me} /> : <SignIn />
}

function Wordmark({ big = false }: { big?: boolean }) {
  const { t } = usePrefs()
  return (
    <div>
      <div className={`flex items-end gap-2 font-bold leading-none ${big ? 'text-6xl' : 'text-3xl'}`}>
        <span>{t('مسار', 'Masar')}</span>
      </div>
      {/* the track motif under the name: four weighted segments, partly filled */}
      <div className={`mt-2 flex gap-[2px] ${big ? 'h-2.5 w-56' : 'h-1.5 w-28'}`} aria-hidden>
        {[38, 26, 20, 16].map((w, i) => (
          <span key={i} className="relative overflow-hidden rounded-[3px] bg-on-brand/20" style={{ flexGrow: w }}>
            <span className="absolute inset-y-0 start-0 bg-on-brand" style={{ width: `${[100, 80, 45, 10][i]}%` }} />
          </span>
        ))}
      </div>
      <div className={`mt-2 text-on-brand/75 ${big ? 'text-base' : 'text-xs'}`}>{t('أداء الموظفين وأهدافهم', 'Performance & goals')}</div>
    </div>
  )
}

/** Demo sign-in: pick who you are. Real email sign-in arrives with the database phase. */
function SignIn() {
  const { db, signIn } = useStore()
  const { t, nm, tl, lang, setLang } = usePrefs()
  const pick: { role: Role; id: string; what: [string, string] }[] = [
    { role: 'admin', id: 'e-admin', what: ['كل الصلاحيات: الشركة والإعدادات والهيكل', 'Everything: company, settings and structure'] },
    { role: 'hr', id: 'e-hr', what: ['كل الموظفين، دورات التقييم، التقارير', 'All staff, review cycles, reports'] },
    { role: 'manager', id: 'e-sales', what: ['فريقه فقط: الأهداف والتقييم والمهارات', 'Their team only: goals, reviews, skills'] },
    { role: 'employee', id: 'e-s2', what: ['ملفه وأهدافه وتقييمه الذاتي', 'Their own profile, goals and self-assessment'] },
  ]
  return (
    <div className="min-h-dvh bg-brand text-on-brand">
      <div className="mx-auto grid min-h-dvh max-w-5xl content-center gap-10 px-5 py-10 md:grid-cols-[1fr_1.2fr]">
        <div>
          <Wordmark big />
          <p className="mt-8 max-w-sm leading-relaxed text-on-brand/85">
            {t(
              'نسخة تجريبية ببيانات شركة وهمية («شركة رواسي التجريبية»). اختاري بأي دور تريدين الدخول لتري ما يراه كل مستخدم.',
              'A demo with a fictional company (“Rawasi Demo Co.”). Choose a role to see the app as that person sees it.',
            )}
          </p>
          <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-on-brand/30 px-4 hover:bg-on-brand/10">
            <Languages size={18} /> {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
        <ul className="grid gap-3">
          {pick.map((p) => {
            const e = db.employees.find((x) => x.id === p.id)
            if (!e) return null
            const pos = db.positions.find((x) => x.id === e.positionId)
            return (
              <li key={p.role}>
                <button type="button" onClick={() => signIn(e.id)} className="flex w-full items-center gap-4 rounded-xl bg-card p-4 text-start text-ink hover:outline hover:outline-2 hover:outline-on-brand">
                  <Avatar name={e.name} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{tl(ROLES[p.role])}</span>
                    <span className="block text-sm text-muted">
                      {nm(e)} — {pos ? (lang === 'ar' ? pos.title : pos.titleEn) : ''}
                    </span>
                    <span className="mt-1 block text-sm">{t(...p.what)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

type NavItem = { to: string; ar: string; en: string; icon: typeof Gauge; show: (e: Employee) => boolean }
const NAV: NavItem[] = [
  { to: '/', ar: 'لوحة التحكم', en: 'Dashboard', icon: Gauge, show: () => true },
  { to: '/employees', ar: 'الموظفون', en: 'People', icon: Users, show: (e) => e.role !== 'employee' },
  { to: '/goals', ar: 'الأهداف', en: 'Goals', icon: Target, show: () => true },
  { to: '/reviews', ar: 'التقييمات', en: 'Reviews', icon: ClipboardCheck, show: () => true },
  { to: '/skills', ar: 'المهارات', en: 'Skills', icon: TrendingUp, show: () => true },
  { to: '/reports', ar: 'التقارير', en: 'Reports', icon: ChartColumnBig, show: (e) => can(e, 'see_reports') },
  { to: '/assistant', ar: 'المساعد الذكي', en: 'Smart assistant', icon: Sparkles, show: () => true },
  { to: '/settings', ar: 'الإعدادات', en: 'Settings', icon: Settings, show: (e) => can(e, 'manage_structure') },
]

function Layout({ me }: { me: Employee }) {
  const { db, today, signOut } = useStore()
  const { t, nm, tl, lang, setLang, theme, setTheme } = usePrefs()
  const [more, setMore] = useState(false)
  const loc = useLocation()
  const items = NAV.filter((n) => n.show(me))
  const unread = noticesFor(db, me, today).filter((n) => !db.readNotices.includes(n.id)).length
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : SunMoon
  const nextTheme = () => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')
  const themeName = { system: t('حسب الجهاز', 'Follow device'), light: t('فاتح', 'Light'), dark: t('داكن', 'Dark') }[theme]
  const team = visibleEmployees(me, db.employees)

  const link = (n: NavItem, mobile = false) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      onClick={() => setMore(false)}
      className={({ isActive }) =>
        mobile
          ? `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] ${isActive ? 'text-on-brand' : 'text-on-brand/65'}`
          : `flex min-h-11 items-center gap-3 rounded-lg px-3 ${isActive ? 'bg-on-brand text-brand font-bold' : 'text-on-brand/85 hover:bg-on-brand/10'}`
      }
    >
      <n.icon size={mobile ? 22 : 19} aria-hidden />
      <span>{lang === 'ar' ? n.ar : n.en}</span>
    </NavLink>
  )

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand px-3 py-5 text-on-brand md:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <nav className="mt-8 grid gap-1">{items.map((n) => link(n))}</nav>
        <div className="mt-auto grid gap-1 border-t border-on-brand/15 pt-3 text-sm">
          <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-on-brand/85 hover:bg-on-brand/10">
            <Languages size={18} /> {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <button type="button" onClick={nextTheme} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-on-brand/85 hover:bg-on-brand/10">
            <ThemeIcon size={18} /> {t('المظهر:', 'Theme:')} {themeName}
          </button>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-ground/95 px-4 py-2 backdrop-blur md:px-8">
          <div className="me-auto flex items-center gap-2 md:hidden">
            <span className="text-xl font-bold">{t('مسار', 'Masar')}</span>
          </div>
          <span className="hidden truncate text-sm text-muted md:block md:me-auto">
            {nm(db.org)} · <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">{t('نسخة تجريبية', 'Demo')}</span>
          </span>
          <Link to="/notifications" className="relative grid size-11 place-items-center rounded-lg hover:bg-brand-soft" aria-label={`${t('الإشعارات', 'Notifications')} (${unread})`}>
            <Bell size={20} />
            {unread > 0 && <span className="num absolute top-1 end-1 grid min-w-5 place-items-center rounded-full bg-late px-1 text-[0.7rem] font-bold text-white">{unread}</span>}
          </Link>
          <Link to={`/employees/${me.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-brand-soft">
            <Avatar name={me.name} size={32} />
            <span className="hidden text-start leading-tight sm:block">
              <span className="block text-sm font-medium">{nm(me)}</span>
              <span className="block text-xs text-muted">{tl(ROLES[me.role])}</span>
            </span>
          </Link>
          <button type="button" onClick={signOut} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-brand-soft" aria-label={t('تبديل المستخدم', 'Switch user')} title={t('تبديل المستخدم', 'Switch user')}>
            <LogOut size={19} />
          </button>
        </header>

        <main key={loc.pathname} className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-7">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/employees" element={me.role === 'employee' ? <Navigate to={`/employees/${me.id}`} /> : <EmployeesPage />} />
            <Route path="/employees/:id" element={<ProfilePage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/goals/:id" element={<GoalPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route path="/reports" element={can(me, 'see_reports') ? <ReportsPage /> : <Navigate to="/" />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={can(me, 'manage_structure') ? <SettingsPage /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex bg-brand pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 4).map((n) => link(n, true))}
        <button type="button" onClick={() => setMore(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] text-on-brand/65">
          <Menu size={22} /> {t('المزيد', 'More')}
        </button>
      </nav>
      {more && (
        <Modal title={t('المزيد', 'More')} onClose={() => setMore(false)}>
          <div className="grid gap-1 rounded-xl bg-brand p-2">{items.slice(4).map((n) => link(n))}</div>
          <div className="mt-3 grid gap-2">
            <MoreButton onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} icon={<Languages size={18} />}>
              {lang === 'ar' ? 'English' : 'العربية'}
            </MoreButton>
            <MoreButton onClick={nextTheme} icon={<ThemeIcon size={18} />}>
              {t('المظهر:', 'Theme:')} {themeName}
            </MoreButton>
            <p className="px-1 text-sm text-muted">
              <BookUser size={14} className="inline" /> {t(`ترى بيانات ${team.length} موظفاً`, `You can see ${team.length} people`)}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MoreButton({ onClick, icon, children }: { onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 hover:bg-brand-soft">
      {icon} {children}
    </button>
  )
}
