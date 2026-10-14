import { lineTotal } from './money'
import { normalizeDigits } from './money'

export interface PricedLine {
  qty: number
  unitPriceBaisa: number
}

export interface SalesTotals {
  subtotalBaisa: number
  discountBaisa: number
  vatRatePercent: number
  vatBaisa: number
  totalBaisa: number
}

/** VAT is charged on the amount after discount. */
export function computeTotals(lines: PricedLine[], discountBaisa: number, vatRatePercent: number): SalesTotals {
  const subtotalBaisa = lines.reduce((s, l) => s + lineTotal(l.qty, l.unitPriceBaisa), 0)
  const discount = Math.min(Math.max(Math.round(discountBaisa), 0), subtotalBaisa)
  const vatBaisa = Math.round(((subtotalBaisa - discount) * vatRatePercent) / 100)
  return {
    subtotalBaisa,
    discountBaisa: discount,
    vatRatePercent,
    vatBaisa,
    totalBaisa: subtotalBaisa - discount + vatBaisa,
  }
}

/** Revenue excludes VAT. */
export function netRevenue(t: Pick<SalesTotals, 'subtotalBaisa' | 'discountBaisa'>): number {
  return t.subtotalBaisa - t.discountBaisa
}

export interface InvoiceRef {
  id: string
  date: string
  createdAt: string
  totalBaisa: number
}

export interface PaymentRef {
  invoiceId?: string
  amountBaisa: number
}

export interface Allocation {
  paid: Map<string, number>
  /** Payments beyond everything invoiced */
  creditBaisa: number
}

/**
 * Works out how much of each invoice is paid. Payments linked to an invoice go
 * to it first; payments on account (and any overpayment) settle the oldest
 * unpaid invoices.
 */
export function allocatePayments(invoices: InvoiceRef[], payments: PaymentRef[]): Allocation {
  const ordered = [...invoices].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const paid = new Map(ordered.map((i) => [i.id, 0]))
  const total = new Map(ordered.map((i) => [i.id, i.totalBaisa]))
  let pool = 0

  for (const p of payments) {
    if (p.invoiceId && paid.has(p.invoiceId)) {
      const room = total.get(p.invoiceId)! - paid.get(p.invoiceId)!
      const used = Math.min(room, p.amountBaisa)
      paid.set(p.invoiceId, paid.get(p.invoiceId)! + used)
      pool += p.amountBaisa - used
    } else {
      pool += p.amountBaisa
    }
  }
  for (const inv of ordered) {
    if (pool <= 0) break
    const used = Math.min(inv.totalBaisa - paid.get(inv.id)!, pool)
    paid.set(inv.id, paid.get(inv.id)! + used)
    pool -= used
  }
  return { paid, creditBaisa: pool }
}

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'

export function invoiceStatus(totalBaisa: number, paidBaisa: number, dueDate: string | undefined, today: string): InvoiceStatus {
  if (paidBaisa >= totalBaisa) return 'paid'
  if (dueDate && dueDate < today) return 'overdue'
  return paidBaisa > 0 ? 'partial' : 'unpaid'
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export type QuoteDisplayStatus = QuoteStatus | 'expired' | 'invoiced'

export function quoteDisplayStatus(
  q: { status: QuoteStatus; validUntil?: string; invoiceId?: string },
  today: string,
): QuoteDisplayStatus {
  if (q.invoiceId) return 'invoiced'
  if (q.status === 'accepted' || q.status === 'rejected') return q.status
  if (q.validUntil && q.validUntil < today) return 'expired'
  return q.status
}

/** "2026-10-14" + 15 → "2026-10-29" */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Phone → international digits for wa.me. Omani 8-digit numbers get the 968
 * country code; a leading 00 or + is dropped. Returns null if unusable.
 */
export function toWhatsAppNumber(phone: string | undefined): string | null {
  if (!phone) return null
  let digits = normalizeDigits(phone).replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 8) digits = `968${digits}`
  return digits.length >= 10 ? digits : null
}
