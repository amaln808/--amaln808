import { computeKpis, type DashboardInput, expensesByCategory, type Kpis, topCustomers, topProducts } from './dashboard'
import type { DateRange } from './periods'

/** "2026-10" → 1–31 October. */
export function monthRange(ym: string): DateRange {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}

/** The month before "2026-01" is "2025-12". */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** The last `n` months up to and including today's, newest first. */
export function recentMonths(today: string, n = 12): string[] {
  const out = [today.slice(0, 7)]
  while (out.length < n) out.push(previousMonth(out[out.length - 1]))
  return out
}

/** Change from the previous month as a fraction (0.25 = +25%); null when there is nothing to compare with. */
export function change(now: number, before: number): number | null {
  if (!before) return null
  return (now - before) / Math.abs(before)
}

interface OrderLike {
  orderDate: string
  status: 'open' | 'done' | 'cancelled'
  amountBaisa: number | null
}
interface PurchaseLike {
  date: string
  totalBaisa: number
}

export interface MonthlyReport {
  month: string
  range: DateRange
  now: Kpis
  before: Kpis
  expenses: Array<{ key: string; total: number }>
  products: ReturnType<typeof topProducts>
  customers: Array<{ key: string; total: number }>
  batches: number
  purchasesBaisa: number
  orders: { count: number; valueBaisa: number; cancelled: number }
}

/** One month of the factory in figures, next to the month before. */
export function monthlyReport(d: DashboardInput, month: string, extra: { purchases: PurchaseLike[]; orders: OrderLike[] }): MonthlyReport {
  const range = monthRange(month)
  const inMonth = (date: string) => date >= range.from && date <= range.to
  const orders = extra.orders.filter((o) => inMonth(o.orderDate))
  const live = orders.filter((o) => o.status !== 'cancelled')
  return {
    month,
    range,
    now: computeKpis(d, range),
    before: computeKpis(d, monthRange(previousMonth(month))),
    expenses: expensesByCategory(d, range),
    products: topProducts(d, range, 10),
    customers: topCustomers(d, range, 5),
    batches: d.batches.filter((b) => inMonth(b.date)).length,
    purchasesBaisa: extra.purchases.filter((p) => inMonth(p.date)).reduce((s, p) => s + p.totalBaisa, 0),
    orders: { count: live.length, valueBaisa: live.reduce((s, o) => s + (o.amountBaisa ?? 0), 0), cancelled: orders.length - live.length },
  }
}
