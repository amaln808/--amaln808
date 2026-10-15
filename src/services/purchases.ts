import { t } from '../i18n/index'
import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import type { ID, PaymentMethod, Purchase, PurchaseLine } from '../db/types'
import { linesTotal } from '../domain/ledger'
import { UserError } from './errors'
import { getItemOrThrow, postMovement, reverseMovements } from './stock'

export interface PurchaseInput {
  supplierId: ID
  date: string
  supplierInvoiceNo?: string
  notes?: string
  lines: PurchaseLine[]
  /** Amount paid at the time of purchase, recorded as a linked supplier payment */
  paidNow?: { amountBaisa: number; method: PaymentMethod }
}

export async function createPurchase(db: FactoryDB, input: PurchaseInput): Promise<ID> {
  const lines = input.lines.filter((l) => l.itemId)
  if (!input.supplierId) throw new UserError(t("اختر المورد", "Choose the supplier"))
  if (!lines.length) throw new UserError(t("أضف بنداً واحداً على الأقل", "Add at least one line"))
  if (lines.some((l) => !(l.qty > 0))) throw new UserError(t("الكمية يجب أن تكون أكبر من صفر", "Quantity must be greater than zero"))
  if (lines.some((l) => l.unitCostBaisa < 0)) throw new UserError(t("سعر الوحدة لا يمكن أن يكون سالباً", "Unit cost can't be negative"))

  return db.transaction(
    'rw',
    [db.items, db.stockMovements, db.purchases, db.supplierPayments, db.suppliers],
    async () => {
      if (!(await db.suppliers.get(input.supplierId))) throw new UserError(t("المورد غير موجود", "Supplier not found"))
      const purchase: Purchase = newRecord({
        supplierId: input.supplierId,
        date: input.date,
        supplierInvoiceNo: input.supplierInvoiceNo?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        lines,
        totalBaisa: linesTotal(lines),
      })
      await db.purchases.add(purchase)

      for (const line of lines) {
        const item = await getItemOrThrow(db, line.itemId)
        if (item.type === 'finished') throw new UserError(t(`«${item.name}» منتج نهائي ولا يُشترى`, `“${item.name}” is a finished product and can't be purchased`))
        await postMovement(db, item, {
          date: input.date,
          type: 'purchase',
          qty: line.qty,
          unitCostBaisa: line.unitCostBaisa,
          refType: 'purchase',
          refId: purchase.id,
        })
      }

      if (input.paidNow && input.paidNow.amountBaisa > 0) {
        await db.supplierPayments.add(
          newRecord({
            supplierId: input.supplierId,
            purchaseId: purchase.id,
            date: input.date,
            amountBaisa: input.paidNow.amountBaisa,
            method: input.paidNow.method,
          }),
        )
      }
      return purchase.id
    },
  )
}

/**
 * Deletes a purchase, removes the stock it added and the payments linked to it.
 * Refused if some of that stock has already been used.
 */
export async function deletePurchase(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.items, db.stockMovements, db.purchases, db.supplierPayments], async () => {
    if (!(await db.purchases.get(id))) throw new UserError(t("فاتورة الشراء غير موجودة", "Purchase invoice not found"))
    await reverseMovements(db, 'purchase', id)
    await db.supplierPayments.where('purchaseId').equals(id).delete()
    await db.purchases.delete(id)
  })
}
