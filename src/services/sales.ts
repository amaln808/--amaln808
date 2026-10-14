import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import type { ID, InvoiceLine, PaymentMethod, QuoteLine, QuoteStatus, Quotation, SalesInvoice } from '../db/types'
import { findShortages, formatDocNo, mergeConsumption } from '../domain/production'
import { formatQty } from '../domain/quantity'
import { computeTotals } from '../domain/sales'
import { UserError } from './errors'
import { takeNumber } from './settings'
import { getItemOrThrow, postMovement, reverseMovements } from './stock'

export interface SalesDocInput {
  customerId: ID
  date: string
  lines: QuoteLine[]
  discountBaisa?: number
  notes?: string
}

function validateDoc(input: SalesDocInput): QuoteLine[] {
  if (!input.customerId) throw new UserError('اختر العميل')
  const lines = input.lines.filter((l) => l.itemId)
  if (!lines.length) throw new UserError('أضف بنداً واحداً على الأقل')
  if (lines.some((l) => !(l.qty > 0))) throw new UserError('الكمية يجب أن تكون أكبر من صفر')
  if (lines.some((l) => !(l.unitPriceBaisa >= 0))) throw new UserError('السعر غير صحيح')
  return lines
}

async function checkProducts(db: FactoryDB, lines: QuoteLine[]) {
  const items = await Promise.all(lines.map((l) => getItemOrThrow(db, l.itemId)))
  const notFinished = items.find((i) => i.type !== 'finished')
  if (notFinished) throw new UserError(`«${notFinished.name}» ليس منتجاً نهائياً`)
  return items
}

// ───────── Quotations ─────────

export interface QuoteInput extends SalesDocInput {
  validUntil?: string
}

export async function createQuote(db: FactoryDB, input: QuoteInput): Promise<ID> {
  const lines = validateDoc(input)
  return db.transaction('rw', [db.items, db.customers, db.quotations, db.settings], async () => {
    if (!(await db.customers.get(input.customerId))) throw new UserError('العميل غير موجود')
    await checkProducts(db, lines)
    const { settings, seq } = await takeNumber(db, 'nextQuoteNo')
    const quote: Quotation = newRecord({
      quoteNo: formatDocNo(settings.quotePrefix ?? 'Q-', seq),
      customerId: input.customerId,
      date: input.date,
      validUntil: input.validUntil || undefined,
      lines,
      ...computeTotals(lines, input.discountBaisa ?? 0, settings.vatRatePercent),
      status: 'draft' as QuoteStatus,
      notes: input.notes?.trim() || undefined,
    })
    await db.quotations.add(quote)
    return quote.id
  })
}

export async function setQuoteStatus(db: FactoryDB, id: ID, status: QuoteStatus): Promise<void> {
  const q = await db.quotations.get(id)
  if (!q) throw new UserError('عرض السعر غير موجود')
  if (q.invoiceId) throw new UserError('تم تحويل هذا العرض إلى فاتورة')
  await db.quotations.put({ ...q, status, updatedAt: new Date().toISOString() })
}

export async function deleteQuote(db: FactoryDB, id: ID): Promise<void> {
  await db.quotations.delete(id)
}

// ───────── Invoices ─────────

export interface InvoiceInput extends SalesDocInput {
  dueDate?: string
  quoteId?: ID
  paidNow?: { amountBaisa: number; method: PaymentMethod }
}

/**
 * Creates a sales invoice: checks stock for every product, records the sale at
 * each product's current average cost (for profit), and optionally a payment.
 */
export async function createInvoice(db: FactoryDB, input: InvoiceInput): Promise<ID> {
  const lines = validateDoc(input)
  return db.transaction(
    'rw',
    [db.items, db.stockMovements, db.customers, db.salesInvoices, db.customerPayments, db.quotations, db.settings],
    async () => {
      if (!(await db.customers.get(input.customerId))) throw new UserError('العميل غير موجود')
      const items = await checkProducts(db, lines)
      const byId = new Map(items.map((i) => [i.id, i]))

      const shortages = findShortages(
        mergeConsumption(lines.map((l) => ({ itemId: l.itemId, qty: l.qty }))),
        new Map(items.map((i) => [i.id, i.qtyOnHand])),
      )
      if (shortages.length) {
        const details = shortages.map((s) => {
          const it = byId.get(s.itemId)!
          return `• ${it.name}: المطلوب ${formatQty(s.required, it.unit)} والمتوفر ${formatQty(s.available, it.unit)}`
        })
        throw new UserError(`الكمية غير متوفرة في المخزون:\n${details.join('\n')}`)
      }

      const { settings, seq } = await takeNumber(db, 'nextInvoiceNo')
      const invoiceId = crypto.randomUUID()
      const invoiceLines: InvoiceLine[] = []
      for (const line of lines) {
        const item = (await db.items.get(line.itemId))!
        invoiceLines.push({ ...line, unitCostBaisa: item.avgCostBaisa })
        await postMovement(db, item, {
          date: input.date,
          type: 'sale',
          qty: -line.qty,
          unitCostBaisa: item.avgCostBaisa,
          refType: 'invoice',
          refId: invoiceId,
        })
      }

      const invoice: SalesInvoice = {
        ...newRecord({
          invoiceNo: formatDocNo(settings.invoicePrefix ?? 'INV-', seq),
          customerId: input.customerId,
          date: input.date,
          dueDate: input.dueDate || undefined,
          lines: invoiceLines,
          ...computeTotals(lines, input.discountBaisa ?? 0, settings.vatRatePercent),
          quoteId: input.quoteId,
          notes: input.notes?.trim() || undefined,
        }),
        id: invoiceId,
      }
      await db.salesInvoices.add(invoice)

      if (input.paidNow && input.paidNow.amountBaisa > 0) {
        await db.customerPayments.add(
          newRecord({
            customerId: input.customerId,
            invoiceId,
            date: input.date,
            amountBaisa: Math.min(input.paidNow.amountBaisa, invoice.totalBaisa),
            method: input.paidNow.method,
          }),
        )
      }

      if (input.quoteId) {
        const q = await db.quotations.get(input.quoteId)
        if (q) await db.quotations.put({ ...q, status: 'accepted', invoiceId, updatedAt: new Date().toISOString() })
      }
      return invoiceId
    },
  )
}

/** Deletes an invoice: returns products to stock, removes its payments and frees its quotation. */
export async function deleteInvoice(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.items, db.stockMovements, db.salesInvoices, db.customerPayments, db.quotations], async () => {
    const inv = await db.salesInvoices.get(id)
    if (!inv) throw new UserError('الفاتورة غير موجودة')
    await reverseMovements(db, 'invoice', id)
    await db.customerPayments.where('invoiceId').equals(id).delete()
    if (inv.quoteId) {
      const q = await db.quotations.get(inv.quoteId)
      if (q) await db.quotations.put({ ...q, status: 'sent', invoiceId: undefined, updatedAt: new Date().toISOString() })
    }
    await db.salesInvoices.delete(id)
  })
}
