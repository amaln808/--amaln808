import { Ellipsis } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ar } from '../i18n/ar'
import { NAV_ITEMS } from './nav'
import { StorageBanner } from './StorageBanner'

function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 lg:w-64 shrink-0 flex-col border-e border-stone-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/icon.svg" alt="" className="size-10 rounded-xl" />
        <span className="font-bold text-brand-800 leading-tight">{ar.appName}</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 pb-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-12 items-center gap-3 rounded-xl px-4 text-[15px] transition-colors ${
                isActive
                  ? 'bg-brand-100 font-bold text-brand-800'
                  : 'text-stone-600 hover:bg-stone-100'
              }`
            }
          >
            <Icon className="size-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

function BottomBar() {
  const { pathname } = useLocation()
  const secondary = NAV_ITEMS.filter((n) => !n.primary)
  const moreActive = pathname === '/more' || secondary.some((n) => pathname.startsWith(n.to))

  const cls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 min-h-14 text-[11px] ${
      active ? 'text-brand-700 font-bold' : 'text-stone-500'
    }`

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.filter((n) => n.primary).map(({ to, label, shortLabel, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cls(isActive)}>
          <Icon className="size-6" />
          {shortLabel ?? label}
        </NavLink>
      ))}
      <NavLink to="/more" className={cls(moreActive)}>
        <Ellipsis className="size-6" />
        {ar.nav.more}
      </NavLink>
    </nav>
  )
}

export function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-24 md:pb-8 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <StorageBanner />
          <Outlet />
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
