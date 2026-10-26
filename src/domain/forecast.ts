import { addDays } from './sales'

/**
 * Expected cash for the next 1 or 3 months — an estimate, so every part is
 * returned separately and shown on screen:
 *  in  = open invoices due by the end (overdue included, shown apart)
 *      + new sales at the average of the last 3 full months, only the share
 *        that falls due inside the window (invoice due days)
 *  out = what is owed to suppliers now + average monthly expenses.
 */
export interface ForecastInput {
  today: string
  months: number
  openInvoices: Array<{ dueDate: string | null; leftBaisa: number }>
  /** Invoice totals of each of the last 3 full months */
  salesByMonth: number[]
  /** Expenses of each of the last 3 full months */
  expensesByMonth: number[]
  invoiceDueDays: number
  payableBaisa: number
}

export interface Forecast {
  until: string
  overdueBaisa: number
  dueBaisa: number
  newSalesBaisa: number
  /** Share of a month's new sales collected inside the window (0–1) */
  newSalesShare: number
  inBaisa: number
  payableBaisa: number
  expensesBaisa: number
  outBaisa: number
  netBaisa: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

export function forecastCash(f: ForecastInput): Forecast {
  const days = f.months * 30
  const until = addDays(f.today, days)
  let overdueBaisa = 0
  let dueBaisa = 0
  for (const i of f.openInvoices) {
    if (i.leftBaisa <= 0) continue
    const due = i.dueDate ?? f.today
    if (due < f.today) overdueBaisa += i.leftBaisa
    else if (due <= until) dueBaisa += i.leftBaisa
  }
  const newSalesShare = Math.max(0, (days - f.invoiceDueDays) / days)
  const newSalesBaisa = Math.round(avg(f.salesByMonth) * f.months * newSalesShare)
  const expensesBaisa = Math.round(avg(f.expensesByMonth) * f.months)
  const inBaisa = overdueBaisa + dueBaisa + newSalesBaisa
  const outBaisa = f.payableBaisa + expensesBaisa
  return { until, overdueBaisa, dueBaisa, newSalesBaisa, newSalesShare, inBaisa, payableBaisa: f.payableBaisa, expensesBaisa, outBaisa, netBaisa: inBaisa - outBaisa }
}

/** "YYYY-MM" of the n full months before today's month, oldest first. */
export function lastFullMonths(today: string, n = 3): string[] {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - n + i, 1))
    return d.toISOString().slice(0, 7)
  })
}
