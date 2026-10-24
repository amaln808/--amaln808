import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, PageHeader } from '../components/ui'
import { t } from '../i18n/index'
import { LanguageToggle } from './LanguageToggle'
import { navItems } from './nav'

/** Phone-only menu for sections that don't fit in the bottom bar. */
export function MorePage() {
  return (
    <>
      <PageHeader title={t('المزيد', 'More')} />
      <Card className="p-2">
        {navItems()
          .filter((n) => !n.primary)
          .map(({ to, label, icon: Icon, phase }) => (
            <Link key={to} to={to} className="flex min-h-14 items-center gap-3 rounded-xl px-3 hover:bg-brand-50">
              <Icon className="size-5 text-brand-800" />
              <span className="flex-1">{label}</span>
              {phase > 0 && <span className="text-xs text-muted">{t(`الجولة ${phase}`, `Round ${phase}`)}</span>}
              <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
            </Link>
          ))}
        <LanguageToggle className="w-full !justify-start !px-3 min-h-14 hover:bg-brand-50" />
      </Card>
    </>
  )
}
