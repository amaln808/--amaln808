import { formatOMR } from './money'

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'
export const BUCKETS: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90']

/** Whole days from a to b (yyyy-mm-dd). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Age of an unpaid amount from its due date: not due yet, or 1–30 … 90+ days late. */
export function agingBucket(dueDate: string | null, today: string): AgingBucket {
  if (!dueDate) return 'current'
  const late = daysBetween(dueDate, today)
  if (late <= 0) return 'current'
  if (late <= 30) return 'd1_30'
  if (late <= 60) return 'd31_60'
  if (late <= 90) return 'd61_90'
  return 'd90'
}

export interface OpenInvoice {
  id: string
  customerId: string
  invoiceNo: string
  dueDate: string | null
  /** Still to be paid */
  leftBaisa: number
}

export type BucketTotals = Record<AgingBucket, number> & { total: number }

const empty = (): BucketTotals => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 })

/** Totals per customer and per bucket, plus the grand total row. */
export function agingTable(invoices: OpenInvoice[], today: string) {
  const byCustomer = new Map<string, BucketTotals>()
  const all = empty()
  for (const inv of invoices) {
    if (inv.leftBaisa <= 0) continue
    const b = agingBucket(inv.dueDate, today)
    const row = byCustomer.get(inv.customerId) ?? empty()
    row[b] += inv.leftBaisa
    row.total += inv.leftBaisa
    all[b] += inv.leftBaisa
    all.total += inv.leftBaisa
    byCustomer.set(inv.customerId, row)
  }
  return { byCustomer, all }
}

/** A polite WhatsApp reminder listing the late invoices. */
export function reminderMessage(customer: string, late: OpenInvoice[], company: string, today: string): string {
  const total = late.reduce((s, i) => s + i.leftBaisa, 0)
  const lines = late.map((i) => `• ${i.invoiceNo}: ${formatOMR(i.leftBaisa, 'ar')}${i.dueDate ? ` (استحقت قبل ${daysBetween(i.dueDate, today)} يوماً)` : ''}`)
  return [
    `السلام عليكم ${customer}،`,
    `نود تذكيركم بلطف بالمبالغ المستحقة لـ ${company}:`,
    ...lines,
    `الإجمالي: ${formatOMR(total, 'ar')}`,
    'نشكر تعاونكم، وإن تم السداد فنرجو تجاهل هذه الرسالة.',
  ].join('\n')
}
