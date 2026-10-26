import type { DateRange } from './periods'

/** Q1 = January–March … Q4 = October–December. */
export function quarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  const mm = (m: number) => String(m).padStart(2, '0')
  return { from: `${year}-${mm(startMonth)}-01`, to: `${year}-${mm(endMonth)}-${lastDay}` }
}

export function quarterOf(date: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  return { year: Number(date.slice(0, 4)), quarter: (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4 }
}

export interface VatSource {
  date: string
  vatBaisa: number
}

/** Output VAT (issued invoices) minus input VAT (purchases and expenses) in the range. */
export function vatSummary(output: VatSource[], input: VatSource[], r: DateRange) {
  const inside = (x: VatSource) => x.date >= r.from && x.date <= r.to
  const outputBaisa = output.filter(inside).reduce((s, x) => s + x.vatBaisa, 0)
  const inputBaisa = input.filter(inside).reduce((s, x) => s + x.vatBaisa, 0)
  return { outputBaisa, inputBaisa, netBaisa: outputBaisa - inputBaisa }
}
