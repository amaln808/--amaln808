import type { AgreementKind, Task, TaskCategory } from '../../data/schedule'
import { durationParts, type Recurrence } from '../../domain/schedule'
import { t } from '../../i18n/index'

export function recurrenceLabel(r: Recurrence): string {
  return {
    once: t('مرة واحدة', 'Once'),
    daily: t('يومية', 'Daily'),
    weekly: t('أسبوعية', 'Weekly'),
    monthly: t('شهرية', 'Monthly'),
    yearly: t('سنوية', 'Yearly'),
  }[r]
}

export function categoryLabel(c: TaskCategory): string {
  return {
    general: t('عام', 'General'),
    production: t('إنتاج', 'Production'),
    quality: t('جودة', 'Quality'),
    cleaning: t('نظافة وتعقيم', 'Cleaning'),
    inventory: t('مخزون', 'Inventory'),
    maintenance: t('صيانة', 'Maintenance'),
    finance: t('مالية', 'Finance'),
    admin: t('إدارية وتراخيص', 'Admin & licences'),
  }[c]
}

export const CATEGORIES: TaskCategory[] = ['general', 'production', 'quality', 'cleaning', 'inventory', 'maintenance', 'finance', 'admin']

export function kindLabel(k: AgreementKind): string {
  return {
    product_permit: t('تصريح بيع منتج', 'Product sale permit'),
    contract: t('عقد / اتفاقية', 'Contract / agreement'),
    license: t('ترخيص / سجل', 'Licence / registration'),
    other: t('أخرى', 'Other'),
  }[k]
}

/** Sunday-first, as the week runs in Oman. */
export function weekdayNames(): string[] {
  return [
    t('الأحد', 'Sun'),
    t('الاثنين', 'Mon'),
    t('الثلاثاء', 'Tue'),
    t('الأربعاء', 'Wed'),
    t('الخميس', 'Thu'),
    t('الجمعة', 'Fri'),
    t('السبت', 'Sat'),
  ]
}

export function formatDate(d: string): string {
  const [y, m, dd] = d.split('-')
  return `${Number(dd)}/${Number(m)}/${y}`
}

/** "Every week: Sunday, Wednesday" — the repeat rule in words. */
export function describeRule(task: Pick<Task, 'recurrence' | 'intervalN' | 'startDate' | 'weekdays'>): string {
  const n = task.intervalN
  const day = Number(task.startDate.slice(8))
  switch (task.recurrence) {
    case 'once':
      return t(`مرة واحدة في ${formatDate(task.startDate)}`, `Once on ${formatDate(task.startDate)}`)
    case 'daily':
      return n === 1 ? t('كل يوم', 'Every day') : t(`كل ${n} أيام`, `Every ${n} days`)
    case 'weekly': {
      const names = weekdayNames()
      const days = (task.weekdays.length ? task.weekdays : [new Date(task.startDate + 'T00:00').getDay()]).map((d) => names[d])
      const every = n === 1 ? t('كل أسبوع', 'Every week') : t(`كل ${n} أسابيع`, `Every ${n} weeks`)
      return `${every}: ${days.join(t('، ', ', '))}`
    }
    case 'monthly': {
      const every = n === 1 ? t('كل شهر', 'Every month') : n === 3 ? t('كل 3 أشهر', 'Every 3 months') : t(`كل ${n} أشهر`, `Every ${n} months`)
      return `${every} ${t(`يوم ${day}`, `on day ${day}`)}`
    }
    case 'yearly': {
      const every = n === 1 ? t('كل سنة', 'Every year') : t(`كل ${n} سنوات`, `Every ${n} years`)
      return `${every} ${t('في', 'on')} ${day}/${Number(task.startDate.slice(5, 7))}`
    }
  }
}

export function durationLabel(start: string | null, end: string): string | null {
  if (!start) return null
  const { years, months, days } = durationParts(start, end)
  const parts: string[] = []
  if (years) parts.push(years === 1 ? t('سنة', '1 year') : years === 2 ? t('سنتان', '2 years') : t(`${years} سنوات`, `${years} years`))
  if (months) parts.push(months === 1 ? t('شهر', '1 month') : months === 2 ? t('شهران', '2 months') : t(`${months} أشهر`, `${months} months`))
  if (days && !years) parts.push(days === 1 ? t('يوم', '1 day') : t(`${days} يوماً`, `${days} days`))
  return parts.join(t(' و', ' ')) || t('يوم', '1 day')
}

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft === 0) return t('ينتهي اليوم', 'Ends today')
  if (daysLeft < 0) return t(`انتهى منذ ${-daysLeft} يوماً`, `Expired ${-daysLeft} days ago`)
  if (daysLeft === 1) return t('ينتهي غداً', 'Ends tomorrow')
  return t(`متبقٍ ${daysLeft} يوماً`, `${daysLeft} days left`)
}
