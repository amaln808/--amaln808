import type { DateRange } from './periods'

/** One line of a customer's account: an invoice or an agreed order adds to what is owed, a payment takes from it. */
export interface StatementEntry {
  date: string
  /** Breaks ties within a day (creation time, else the number) */
  seq: string
  kind: 'invoice' | 'order' | 'payment'
  /** Invoice / order number; for a payment, what it was for */
  ref: string | null
  chargeBaisa: number
  paymentBaisa: number
  /** Payments: how it was paid */
  method?: string | null
  notes?: string | null
}

export interface StatementRow extends StatementEntry {
  balanceBaisa: number
}

export interface Statement {
  /** Balance carried from before the period */
  openingBaisa: number
  rows: StatementRow[]
  chargesBaisa: number
  paymentsBaisa: number
  closingBaisa: number
}

/** Running balance over a period, with what was owed before it carried in as the opening balance. */
export function buildCustomerStatement(entries: StatementEntry[], range: DateRange): Statement {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.seq.localeCompare(b.seq))
  let balance = 0
  let openingBaisa = 0
  let chargesBaisa = 0
  let paymentsBaisa = 0
  const rows: StatementRow[] = []
  for (const e of sorted) {
    if (e.date > range.to) break
    balance += e.chargeBaisa - e.paymentBaisa
    if (e.date < range.from) {
      openingBaisa = balance
      continue
    }
    chargesBaisa += e.chargeBaisa
    paymentsBaisa += e.paymentBaisa
    rows.push({ ...e, balanceBaisa: balance })
  }
  return { openingBaisa, rows, chargesBaisa, paymentsBaisa, closingBaisa: openingBaisa + chargesBaisa - paymentsBaisa }
}

interface InvoiceLike {
  id: string
  invoiceNo: string
  customerId: string
  date: string
  status: 'issued' | 'void'
  totalBaisa: number
  createdAt: string
}
interface PaymentLike {
  id: string
  customerId: string
  invoiceId: string | null
  date: string
  amountBaisa: number
  method: string
  notes: string | null
}
interface OrderLike {
  id: string
  orderNo: string
  customerId: string
  orderDate: string
  status: 'open' | 'done' | 'cancelled'
  invoiceId: string | null
  amountBaisa: number | null
  steps: Array<{ id: string; kind: string; doneDate: string | null; amountBaisa: number | null; paymentId?: string | null; method?: string | null; title: string }>
}

/**
 * Everything that moved a customer's balance, matching the balance on their
 * page: issued invoices, orders agreed but not invoiced yet (their agreed
 * value), the receipts recorded, and order payments received without a
 * receipt in the account.
 */
export function customerEntries(customerId: string, data: { invoices: InvoiceLike[]; payments: PaymentLike[]; orders: OrderLike[] }): StatementEntry[] {
  const out: StatementEntry[] = []
  const invoiceNo = new Map(data.invoices.map((i) => [i.id, i.invoiceNo]))
  const orderOfPayment = new Map<string, string>()
  const receipts = new Set(data.payments.filter((p) => p.customerId === customerId).map((p) => p.id))
  for (const i of data.invoices) {
    if (i.customerId !== customerId || i.status !== 'issued') continue
    out.push({ date: i.date, seq: i.createdAt, kind: 'invoice', ref: i.invoiceNo, chargeBaisa: i.totalBaisa, paymentBaisa: 0 })
  }
  for (const o of data.orders) {
    if (o.customerId !== customerId) continue
    for (const s of o.steps) if (s.paymentId) orderOfPayment.set(s.paymentId, o.orderNo)
    if (o.status === 'cancelled' || o.invoiceId || !o.amountBaisa) continue
    out.push({ date: o.orderDate, seq: o.orderNo, kind: 'order', ref: o.orderNo, chargeBaisa: o.amountBaisa, paymentBaisa: 0 })
    for (const s of o.steps) {
      // A stage with a receipt is counted through the receipt (unless it has not reached the server yet)
      if (s.kind !== 'payment' || !s.doneDate || (s.paymentId && receipts.has(s.paymentId)) || !s.amountBaisa) continue
      out.push({ date: s.doneDate, seq: `${o.orderNo}~${s.id}`, kind: 'payment', ref: o.orderNo, chargeBaisa: 0, paymentBaisa: s.amountBaisa, method: s.method ?? null, notes: s.title })
    }
  }
  for (const p of data.payments) {
    if (p.customerId !== customerId) continue
    const ref = (p.invoiceId && invoiceNo.get(p.invoiceId)) || orderOfPayment.get(p.id) || null
    out.push({ date: p.date, seq: `~${p.id}`, kind: 'payment', ref, chargeBaisa: 0, paymentBaisa: p.amountBaisa, method: p.method, notes: p.notes })
  }
  return out
}
