import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import { SETTINGS_ID } from '../db/seed'
import type { ConsumedLine, ID, ProductionBatch } from '../db/types'
import { computeBatchCost, findShortages, formatBatchNo, mergeConsumption, type ConsumptionLine } from '../domain/production'
import { formatQty } from '../domain/quantity'
import { UserError } from './errors'
import { getItemOrThrow, postMovement, reverseMovements } from './stock'

export interface BatchInput {
  finishedItemId: ID
  recipeId?: ID
  date: string
  qtyProduced: number
  consumed: ConsumptionLine[]
  extraCostBaisa?: number
  expiryDate?: string
  notes?: string
}

/**
 * Records a production batch: consumes materials at their average cost, adds the
 * finished units at the resulting unit cost, and assigns the next batch number.
 */
export async function createBatch(db: FactoryDB, input: BatchInput): Promise<ID> {
  if (!(input.qtyProduced > 0)) throw new UserError('أدخل الكمية المنتجة')
  const lines = mergeConsumption(input.consumed)
  if (!lines.length) throw new UserError('أضف المواد المستهلكة')
  if ((input.extraCostBaisa ?? 0) < 0) throw new UserError('التكاليف الإضافية لا يمكن أن تكون سالبة')

  return db.transaction('rw', [db.items, db.stockMovements, db.productionBatches, db.settings], async () => {
    const product = await getItemOrThrow(db, input.finishedItemId)
    if (product.type !== 'finished') throw new UserError('اختر منتجاً نهائياً')

    const materials = await Promise.all(lines.map((l) => getItemOrThrow(db, l.itemId)))
    if (materials.some((m) => m.type === 'finished')) throw new UserError('لا يمكن استهلاك منتج نهائي في الإنتاج')

    // Report every missing material at once
    const shortages = findShortages(lines, new Map(materials.map((m) => [m.id, m.qtyOnHand])))
    if (shortages.length) {
      const byId = new Map(materials.map((m) => [m.id, m]))
      const details = shortages.map((s) => {
        const m = byId.get(s.itemId)!
        return `• ${m.name}: المطلوب ${formatQty(s.required, m.unit)} والمتوفر ${formatQty(s.available, m.unit)}`
      })
      throw new UserError(`المواد غير كافية:\n${details.join('\n')}`)
    }

    const settings = await db.settings.get(SETTINGS_ID)
    const seq = settings?.nextBatchNo ?? 1
    const batchId = crypto.randomUUID()

    const consumed: ConsumedLine[] = []
    for (const [i, line] of lines.entries()) {
      const item = materials[i]
      consumed.push({ itemId: item.id, qty: line.qty, unitCostBaisa: item.avgCostBaisa })
      await postMovement(db, item, {
        date: input.date,
        type: 'production_out',
        qty: -line.qty,
        unitCostBaisa: item.avgCostBaisa,
        refType: 'batch',
        refId: batchId,
      })
    }

    const cost = computeBatchCost(consumed, input.extraCostBaisa ?? 0, input.qtyProduced)
    await postMovement(db, product, {
      date: input.date,
      type: 'production_in',
      qty: input.qtyProduced,
      unitCostBaisa: cost.unitCostBaisa,
      refType: 'batch',
      refId: batchId,
    })

    const batch: ProductionBatch = {
      ...newRecord({
        batchNo: formatBatchNo(settings?.batchPrefix ?? 'B-', seq),
        date: input.date,
        recipeId: input.recipeId,
        finishedItemId: product.id,
        qtyProduced: input.qtyProduced,
        consumed,
        ...cost,
        expiryDate: input.expiryDate || undefined,
        notes: input.notes?.trim() || undefined,
      }),
      id: batchId,
    }
    await db.productionBatches.add(batch)
    if (settings) await db.settings.put({ ...settings, nextBatchNo: seq + 1, updatedAt: new Date().toISOString() })
    return batchId
  })
}

/** Deletes a batch, returning materials to stock. Refused if its units were already sold or used. */
export async function deleteBatch(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', [db.items, db.stockMovements, db.productionBatches], async () => {
    if (!(await db.productionBatches.get(id))) throw new UserError('الدفعة غير موجودة')
    await reverseMovements(db, 'batch', id)
    await db.productionBatches.delete(id)
  })
}
