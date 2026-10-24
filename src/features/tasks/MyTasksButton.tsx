import { CalendarCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { t } from '../../i18n/index'
import { useStock } from '../inventory/useStock'
import { useSchedule } from './useSchedule'

/** Always-visible "My tasks" icon; the badge counts what is open today plus agreement and expiry alerts. */
export function MyTasksButton() {
  const { openCount: taskCount, alerts } = useSchedule()
  const stock = useStock()
  const openCount = taskCount + stock.alerts.expiredLots.length + stock.alerts.expiringLots.length
  const urgent = alerts.some((a) => a.status === 'expired') || stock.alerts.expiredLots.length > 0
  return (
    <Link
      to="/tasks"
      className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-[15px] font-medium text-brand-800 hover:bg-brand-50"
      aria-label={t(`مهامي، ${openCount} مفتوحة`, `My tasks, ${openCount} open`)}
    >
      <CalendarCheck className="size-5" />
      {t('مهامي', 'My tasks')}
      {openCount > 0 && (
        <span
          className={`num inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-6 ${
            urgent ? 'bg-red-600 text-white' : 'bg-brand-700 text-on-brand'
          }`}
        >
          {openCount}
        </span>
      )}
    </Link>
  )
}
