import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, PageHeader } from '../components/ui'
import { ar } from '../i18n/ar'
import { NAV_ITEMS } from './nav'

/** Phone-only menu for sections that don't fit in the bottom bar. */
export function MorePage() {
  return (
    <>
      <PageHeader title={ar.nav.more} />
      <Card className="p-2">
        {NAV_ITEMS.filter((n) => !n.primary).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex min-h-14 items-center gap-3 rounded-xl px-3 hover:bg-stone-50">
            <Icon className="size-5 text-brand-700" />
            <span className="flex-1">{label}</span>
            <ChevronLeft className="size-5 text-stone-400" />
          </Link>
        ))}
      </Card>
    </>
  )
}
