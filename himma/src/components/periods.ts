import { addDays, addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { day, iso } from '../../../src/domain/schedule'
import { weekStart } from '../domain/performance'

export type Period = 'week' | 'month' | 'last_month' | 'quarter' | 'all'
export const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'هذا الأسبوع' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'last_month', label: 'الشهر الماضي' },
  { value: 'quarter', label: 'آخر 3 أشهر' },
  { value: 'all', label: 'الكل' },
]

export function periodRange(p: Period, today: string, earliest: string): [string, string] {
  const t = day(today)
  switch (p) {
    case 'week':
      return [weekStart(today), iso(addDays(day(weekStart(today)), 6))]
    case 'month':
      return [iso(startOfMonth(t)), iso(endOfMonth(t))]
    case 'last_month':
      return [iso(startOfMonth(addMonths(t, -1))), iso(endOfMonth(addMonths(t, -1)))]
    case 'quarter':
      return [iso(addMonths(addDays(t, 1), -3)), today]
    case 'all':
      return [earliest < today ? earliest : today, today]
  }
}
