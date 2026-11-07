import { formatDate } from '../../components/format'
import { lineTotal } from '../../domain/money'
import { t } from '../../i18n/index'

/** One cell for write-excel-file (null = empty). */
export type Cell = { value: string | number; format?: string; fontWeight?: 'bold' } | null
export interface Sheet {
  sheet: string
  data: Cell[][]
}

export interface ExportDoc {
  id: string
  no: string
  date: string
  customer: string
  channel?: string
  /** Due date (invoice) or valid-until date (quotation) */
  until: string | null
  status: string
  /** Counted in the totals row (void invoices are listed but not added up) */
  counts: boolean
  subtotalBaisa: number
  discountBaisa: number
  vatBaisa: number
  totalBaisa: number
  /** Invoices: paid so far; quotations: the invoice it became */
  paidBaisa?: number
  invoiceNo?: string | null
  notes: string | null
}
export interface ExportLine {
  docId: string
  product: string
  qty: number
  unitPriceBaisa: number
  discountBaisa: number
  vatBaisa: number
  /** Batch numbers the line was taken from (invoices) */
  lots?: string[]
}

const head = (labels: string[]): Cell[] => labels.map((value) => ({ value, fontWeight: 'bold' }))
const money = (baisa: number): Cell => ({ value: baisa / 1000, format: '#,##0.000' })
const text = (v: string | null | undefined): Cell => (v ? { value: v } : null)

/**
 * The two sheets of an export: one row per document (with a totals row),
 * then one row per line, so the file can be filtered by customer or product.
 */
export function buildSalesSheets(kind: 'invoice' | 'quote', docs: ExportDoc[], lines: ExportLine[]): Sheet[] {
  const isInvoice = kind === 'invoice'
  const counted = docs.filter((d) => d.counts)
  const sum = (f: (d: ExportDoc) => number) => counted.reduce((s, d) => s + f(d), 0)
  const docHead = [
    isInvoice ? t('رقم الفاتورة', 'Invoice no.') : t('رقم العرض', 'Quotation no.'),
    t('التاريخ', 'Date'),
    t('العميل', 'Customer'),
    ...(isInvoice ? [t('القناة', 'Channel')] : []),
    isInvoice ? t('تاريخ الاستحقاق', 'Due date') : t('ساري حتى', 'Valid until'),
    t('الحالة', 'Status'),
    t('المجموع', 'Subtotal'),
    t('الخصم', 'Discount'),
    t('الضريبة', 'VAT'),
    t('الإجمالي', 'Total'),
    ...(isInvoice ? [t('المدفوع', 'Paid'), t('المتبقي', 'Left to pay')] : [t('الفاتورة', 'Invoice')]),
    t('ملاحظات', 'Notes'),
  ]
  const docRows: Cell[][] = docs.map((d) => [
    { value: d.no },
    { value: formatDate(d.date) },
    text(d.customer),
    ...(isInvoice ? [text(d.channel)] : []),
    d.until ? { value: formatDate(d.until) } : null,
    { value: d.status },
    money(d.subtotalBaisa),
    money(d.discountBaisa),
    money(d.vatBaisa),
    money(d.totalBaisa),
    ...(isInvoice ? (d.counts ? [money(d.paidBaisa ?? 0), money(d.totalBaisa - (d.paidBaisa ?? 0))] : [null, null]) : [text(d.invoiceNo)]),
    text(d.notes),
  ])
  const totals: Cell[] = [
    { value: t(`الإجمالي (${counted.length})`, `Total (${counted.length})`), fontWeight: 'bold' },
    null,
    null,
    ...(isInvoice ? [null] : []),
    null,
    null,
    money(sum((d) => d.subtotalBaisa)),
    money(sum((d) => d.discountBaisa)),
    money(sum((d) => d.vatBaisa)),
    money(sum((d) => d.totalBaisa)),
    ...(isInvoice ? [money(sum((d) => d.paidBaisa ?? 0)), money(sum((d) => d.totalBaisa - (d.paidBaisa ?? 0)))] : [null]),
    null,
  ]

  const byId = new Map(docs.map((d) => [d.id, d]))
  const lineHead = [
    isInvoice ? t('رقم الفاتورة', 'Invoice no.') : t('رقم العرض', 'Quotation no.'),
    t('التاريخ', 'Date'),
    t('العميل', 'Customer'),
    t('المنتج', 'Product'),
    t('الكمية', 'Qty'),
    t('سعر الوحدة', 'Unit price'),
    t('المبلغ', 'Amount'),
    ...(isInvoice ? [t('الخصم', 'Discount'), t('الضريبة', 'VAT'), t('الإجمالي', 'Total'), t('رقم الدفعة', 'Batch')] : []),
  ]
  const lineRows: Cell[][] = lines
    .filter((l) => byId.has(l.docId))
    .map((l) => {
      const d = byId.get(l.docId)!
      const gross = lineTotal(l.qty, l.unitPriceBaisa)
      return [
        { value: d.no },
        { value: formatDate(d.date) },
        text(d.customer),
        text(l.product),
        { value: l.qty, format: '#,##0.###' },
        money(l.unitPriceBaisa),
        money(gross),
        ...(isInvoice ? [money(l.discountBaisa), money(l.vatBaisa), money(gross - l.discountBaisa + l.vatBaisa), text((l.lots ?? []).join('، '))] : []),
      ]
    })

  return [
    { sheet: isInvoice ? t('الفواتير', 'Invoices') : t('عروض الأسعار', 'Quotations'), data: [head(docHead), ...docRows, [], totals] },
    { sheet: t('البنود', 'Lines'), data: [head(lineHead), ...lineRows] },
  ]
}
