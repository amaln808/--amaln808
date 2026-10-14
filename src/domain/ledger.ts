import { lineTotal } from './money'

/** One row in an account statement (supplier or customer). */
export interface LedgerEntry {
  id: string
  date: string
  createdAt: string
  kind: 'invoice' | 'payment'
  /** Amount that increases what is owed (invoice) */
  chargeBaisa: number
  /** Amount that decreases what is owed (payment) */
  paymentBaisa: number
}

export interface StatementRow extends LedgerEntry {
  balanceBaisa: number
}

/** Orders entries by date (then creation time) and adds the running balance. */
export function buildStatement(entries: LedgerEntry[]): StatementRow[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  )
  let balance = 0
  return sorted.map((e) => {
    balance += e.chargeBaisa - e.paymentBaisa
    return { ...e, balanceBaisa: balance }
  })
}

/** Outstanding balance = total invoiced − total paid. Negative means credit in our favour. */
export function balanceDue(invoiceTotals: number[], paymentAmounts: number[]): number {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  return sum(invoiceTotals) - sum(paymentAmounts)
}

export function linesTotal(lines: Array<{ qty: number; unitCostBaisa: number }>): number {
  return lines.reduce((sum, l) => sum + lineTotal(l.qty, l.unitCostBaisa), 0)
}
