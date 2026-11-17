import { day } from '../../src/domain/schedule'
import type { Task } from './data/store'
import type { Scope } from './domain/performance'

const dateFmt = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })
const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const longDate = (d: string) => dateFmt.format(day(d))
export const shortDate = (d: string) => shortFmt.format(day(d))
export const fullDate = (d: string) => fullFmt.format(day(d))
export const num = (n: number) => numFmt.format(n)
export const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)

export const SCOPE: Record<Scope, string> = { work: 'عمل', personal: 'شخصي' }
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

/** "every day", "every 2 weeks: Sun, Tue", "once on 16 Nov"… */
export function repeatText(t: Pick<Task, 'recurrence' | 'intervalN' | 'weekdays' | 'startDate'>): string {
  const n = t.intervalN
  switch (t.recurrence) {
    case 'once':
      return `مرة واحدة في ${shortDate(t.startDate)}`
    case 'daily':
      return n > 1 ? `كل ${n} أيام` : 'يومياً'
    case 'weekly': {
      const days = (t.weekdays.length ? t.weekdays : [day(t.startDate).getDay()]).map((d) => WEEKDAYS[d]).join('، ')
      return `${n > 1 ? `كل ${n} أسابيع` : 'أسبوعياً'}: ${days}`
    }
    case 'monthly':
      return `${n > 1 ? `كل ${n} أشهر` : 'شهرياً'} يوم ${day(t.startDate).getDate()}`
    case 'yearly':
      return `${n > 1 ? `كل ${n} سنوات` : 'سنوياً'} في ${shortDate(t.startDate)}`
  }
}

/** Parse a number typed with Arabic or Latin digits ("١٢٫٥", "12.5"). */
export function parseNum(s: string): number | null {
  const latin = s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, '.')
    .trim()
  if (!latin || !/^-?\d*\.?\d+$/.test(latin)) return null
  return Number(latin)
}
