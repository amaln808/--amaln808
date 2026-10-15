import { t } from '../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ellipsis } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { db } from '../db/db'
import { isLowStock } from '../domain/inventory'
import { ar } from '../i18n/ar'
import { isNavActive, NAV_ITEMS } from './nav'
import { BackupReminder } from './BackupReminder'
import { LanguageToggle } from './LanguageToggle'
import { StorageBanner } from './StorageBanner'
import { LOGO_URL } from './assets'

function useLowStockCount() {
  return useLiveQuery(async () => (await db.items.toArray()).filter((i) => i.active && isLowStock(i)).length, []) ?? 0
}

function CountBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-5 text-white">
      {count}
    </span>
  )
}

function Sidebar() {
  const { pathname } = useLocation()
  const lowStock = useLowStockCount()
  return (
    <aside className="hidden md:flex w-56 lg:w-64 shrink-0 flex-col border-e border-stone-200 bg-white">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={LOGO_URL} alt="" className="h-14 w-auto" />
        <div className="leading-tight">
          <div className="text-xl font-bold text-[#5b4a2f]">{ar.appName}</div>
          <div className="text-xs text-stone-500">{t("إدارة المصنع", "Factory management")}</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3 pb-4">
        {NAV_ITEMS.map((item) => {
          const { to, label, icon: Icon } = item
          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-[15px] transition-colors ${
                isNavActive(item, pathname)
                  ? 'bg-brand-100 font-bold text-brand-800'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {to === '/inventory' && <CountBadge count={lowStock} />}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto px-3 pb-4">
        <LanguageToggle className="w-full" />
      </div>
    </aside>
  )
}

function BottomBar() {
  const { pathname } = useLocation()
  const lowStock = useLowStockCount()
  const secondary = NAV_ITEMS.filter((n) => !n.primary)
  const moreActive = pathname === '/more' || secondary.some((n) => isNavActive(n, pathname))

  const cls = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 min-h-14 text-[11px] ${
      active ? 'text-brand-700 font-bold' : 'text-stone-500'
    }`

  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.filter((n) => n.primary).map((item) => {
        const { to, label, shortLabel, icon: Icon } = item
        return (
          <Link key={to} to={to} className={`relative ${cls(isNavActive(item, pathname))}`}>
            <Icon className="size-6" />
            {shortLabel ?? label}
            {to === '/inventory' && (
              <span className="absolute top-1.5 start-[calc(50%+6px)]">
                <CountBadge count={lowStock} />
              </span>
            )}
          </Link>
        )
      })}
      <Link to="/more" className={cls(moreActive)}>
        <Ellipsis className="size-6" />
        {ar.nav.more}
      </Link>
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
          <BackupReminder />
          <Outlet />
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
