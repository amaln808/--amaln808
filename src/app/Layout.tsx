import { Ellipsis } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { MyTasksButton } from '../features/tasks/MyTasksButton'
import { t } from '../i18n/index'
import { LOGO_URL } from './assets'
import { ConnectionBadge } from './ConnectionBadge'
import { LanguageToggle } from './LanguageToggle'
import { isNavActive, navItems } from './nav'

const logoVar = { '--logo-url': `url(${LOGO_URL})` } as CSSProperties

/** The calligraphic Zawrda mark, drawn in the current text colour. */
export function LogoMark({ className = '' }: { className?: string }) {
  return <div role="img" aria-label={t('زوردة', 'Zawrda')} className={`logo-mark ${className}`} style={logoVar} />
}

function Rail() {
  const { pathname } = useLocation()
  return (
    <aside className="hidden md:flex w-60 lg:w-64 shrink-0 flex-col overflow-y-auto bg-rail text-on-rail">
      <div className="flex flex-col items-center px-6 pt-6 pb-4">
        <LogoMark className="h-24 w-12" />
        <div className="mt-2 text-sm opacity-75">{t('إدارة المصنع', 'Factory management')}</div>
      </div>
      <nav className="flex flex-col px-3 pb-3">
        {navItems().map((item) => {
          const { to, label, icon: Icon, phase } = item
          const active = isNavActive(item, pathname)
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3.5 text-[15px] transition-colors ${
                active ? 'bg-card font-bold text-brand-800' : phase ? 'opacity-55 hover:opacity-80' : 'hover:bg-on-rail/10'
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1">{label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-2 px-3 pb-4">
        <ConnectionBadge className="self-start" />
        <LanguageToggle className="w-full hover:bg-on-rail/10" />
      </div>
    </aside>
  )
}

function BottomBar() {
  const { pathname } = useLocation()
  const items = navItems()
  const secondary = items.filter((n) => !n.primary)
  const moreActive = pathname === '/more' || secondary.some((n) => isNavActive(n, pathname))

  const cls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 min-h-14 text-[11px] ${
      active ? 'text-brand-800 font-bold' : 'text-muted'
    }`

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {items
        .filter((n) => n.primary)
        .map((item) => {
          const { to, label, shortLabel, icon: Icon } = item
          return (
            <Link key={to} to={to} className={cls(isNavActive(item, pathname))}>
              <Icon className="size-6" />
              {shortLabel ?? label}
            </Link>
          )
        })}
      <Link to="/more" className={cls(moreActive)}>
        <Ellipsis className="size-6" />
        {t('المزيد', 'More')}
      </Link>
    </nav>
  )
}

export function Layout() {
  return (
    <div className="flex h-full">
      <Rail />
      <main className="flex-1 overflow-y-auto pb-24 md:pb-8 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <div className="mb-3 flex items-center gap-3">
            <LogoMark className="h-12 w-6 text-brand-800 md:hidden" />
            <ConnectionBadge className="md:hidden" />
            <div className="ms-auto">
              <MyTasksButton />
            </div>
          </div>
          <Outlet />
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
