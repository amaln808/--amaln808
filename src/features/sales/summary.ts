import type { SalesData } from '../../data/sales'
import { allocatePayments, type InvoiceStatus, invoiceStatus, quoteDisplayStatus, type QuoteDisplayStatus } from '../../domain/sales'
import { t } from '../../i18n/index'

export interface InvoiceInfo {
  paidBaisa: number
  /** Void invoices have no payment status */
  status: InvoiceStatus | 'void'
}

export interface CustomerBalance {
  invoicedBaisa: number
  paidBaisa: number
  dueBaisa: number
  overdueBaisa: number
}

/**
 * Payment status of every invoice and the balance of every customer. Payments
 * linked to an invoice settle it first; the rest settle the oldest invoices.
 */
export function summarize(data: SalesData, today: string) {
  const invoiceInfo = new Map<string, InvoiceInfo>()
  const balances = new Map<string, CustomerBalance>()
  for (const c of data.customers) {
    const issued = data.invoices.filter((i) => i.customerId === c.id && i.status === 'issued')
    const payments = data.payments.filter((p) => p.customerId === c.id)
    const { paid } = allocatePayments(
      issued.map((i) => ({ id: i.id, date: i.date, createdAt: i.createdAt, totalBaisa: i.totalBaisa })),
      payments.map((p) => ({ invoiceId: p.invoiceId ?? undefined, amountBaisa: p.amountBaisa })),
    )
    const b: CustomerBalance = { invoicedBaisa: 0, paidBaisa: payments.reduce((s, p) => s + p.amountBaisa, 0), dueBaisa: 0, overdueBaisa: 0 }
    for (const i of issued) {
      const p = paid.get(i.id) ?? 0
      const status = invoiceStatus(i.totalBaisa, p, i.dueDate ?? undefined, today)
      invoiceInfo.set(i.id, { paidBaisa: p, status })
      b.invoicedBaisa += i.totalBaisa
      if (status === 'overdue') b.overdueBaisa += i.totalBaisa - p
    }
    b.dueBaisa = b.invoicedBaisa - b.paidBaisa
    balances.set(c.id, b)
  }
  for (const i of data.invoices) if (i.status === 'void') invoiceInfo.set(i.id, { paidBaisa: 0, status: 'void' })
  return { invoiceInfo, balances }
}

export function quoteStatusOf(q: SalesData['quotations'][number], today: string): QuoteDisplayStatus {
  return quoteDisplayStatus({ status: q.status, validUntil: q.validUntil ?? undefined, invoiceId: q.invoiceId ?? undefined }, today)
}

export function invoiceStatusLabel(s: InvoiceInfo['status']): string {
  return {
    paid: t('مدفوعة', 'Paid'),
    partial: t('مدفوعة جزئياً', 'Part paid'),
    unpaid: t('غير مدفوعة', 'Unpaid'),
    overdue: t('متأخرة', 'Overdue'),
    void: t('ملغاة', 'Void'),
  }[s]
}

export const INVOICE_TONE = { paid: 'green', partial: 'amber', unpaid: 'stone', overdue: 'red', void: 'stone' } as const

export function quoteStatusLabel(s: QuoteDisplayStatus): string {
  return {
    draft: t('مسودة', 'Draft'),
    sent: t('مُرسل', 'Sent'),
    accepted: t('مقبول', 'Accepted'),
    rejected: t('مرفوض', 'Rejected'),
    expired: t('منتهي', 'Expired'),
    invoiced: t('مقبول — صدرت فاتورته', 'Accepted — invoiced'),
  }[s]
}

export const QUOTE_TONE = { draft: 'stone', sent: 'amber', accepted: 'green', invoiced: 'green', rejected: 'red', expired: 'red' } as const
