/** Date ranges for filters. All dates are ISO `YYYY-MM-DD`, inclusive. */

export type PeriodKey = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear' | 'all' | 'custom'

export interface DateRange {
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Resolves a named period relative to `today`. */
export function periodRange(key: Exclude<PeriodKey, 'custom'>, today: string): DateRange {
  const [y, m] = today.split('-').map(Number)
  switch (key) {
    case 'thisMonth':
      return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) }
    case 'lastMonth': {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1]
      return { from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) }
    }
    case 'last3Months': {
      // This month and the two before it
      const start = new Date(Date.UTC(y, m - 3, 1))
      return { from: iso(start.getUTCFullYear(), start.getUTCMonth() + 1, 1), to: iso(y, m, lastDay(y, m)) }
    }
    case 'thisYear':
      return { from: iso(y, 1, 1), to: iso(y, 12, 31) }
    case 'all':
      return { from: '0000-01-01', to: '9999-12-31' }
  }
}

export function inRange(date: string, r: DateRange): boolean {
  return date >= r.from && date <= r.to
}

/** "2026-10" for each month touched by the range, oldest first (capped at 36). */
export function monthsInRange(r: DateRange): string[] {
  const out: string[] = []
  let [y, m] = r.from.split('-').map(Number)
  const end = r.to.slice(0, 7)
  while (out.length < 36) {
    const key = `${y}-${pad(m)}`
    out.push(key)
    if (key >= end) break
    m === 12 ? ((y += 1), (m = 1)) : (m += 1)
  }
  return out
}

/** Sums amounts per key, largest first. */
export function totalsBy<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number): Array<{ key: string; total: number }> {
  const map = new Map<string, number>()
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + amount(r))
  return [...map].map(([k, total]) => ({ key: k, total })).sort((a, b) => b.total - a.total)
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

/** "2026-10" → "أكتوبر 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_AR[m - 1]} ${y}`
}
