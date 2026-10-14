import type { FactoryDB } from '../db/db'
import { newRecord, today } from '../db/records'
import type { BaseRecord, ID, Item, MovementType, RefType, StockMovement } from '../db/types'
import { InsufficientStockError, issue, receive, reverseReceipt, type StockState } from '../domain/inventory'
import { formatQty } from '../domain/quantity'
import { UserError } from './errors'

export function insufficientMessage(item: Item, available: number, requested: number): string {
  return `الكمية غير كافية من «${item.name}»: المتوفر ${formatQty(available, item.unit)} والمطلوب ${formatQty(requested, item.unit)}`
}

/** Runs a stock calculation and turns shortages into a readable Arabic error. */
export function withStockCheck(item: Item, fn: () => StockState): StockState {
  try {
    return fn()
  } catch (e) {
    if (e instanceof InsufficientStockError) throw new UserError(insufficientMessage(item, e.available, e.requested))
    throw e
  }
}

export async function getItemOrThrow(db: FactoryDB, id: ID): Promise<Item> {
  const item = await db.items.get(id)
  if (!item) throw new UserError('الصنف غير موجود')
  return item
}

interface MovementInput {
  date: string
  type: MovementType
  qty: number
  unitCostBaisa: number
  refType: RefType
  refId?: ID
  notes?: string
}

/**
 * Applies one movement to an item and records it. Must be called inside a
 * transaction that includes `items` and `stockMovements`.
 */
export async function postMovement(db: FactoryDB, item: Item, m: MovementInput): Promise<Item> {
  const next = withStockCheck(item, () =>
    m.qty > 0 ? receive(item, m.qty, m.unitCostBaisa) : issue(item, -m.qty, item.name),
  )
  const updated: Item = { ...item, ...next, updatedAt: new Date().toISOString() }
  await db.items.put(updated)
  await db.stockMovements.add(newRecord<Omit<StockMovement, keyof BaseRecord>>({ ...m, itemId: item.id }))
  return updated
}

/** Removes every movement created by a document and undoes its effect on stock. */
export async function reverseMovements(db: FactoryDB, refType: RefType, refId: ID): Promise<void> {
  const movements = await db.stockMovements.where('[refType+refId]').equals([refType, refId]).toArray()
  // Undo newest first so averages unwind in the right order
  for (const m of movements.reverse()) {
    const item = await getItemOrThrow(db, m.itemId)
    const next = withStockCheck(item, () =>
      m.qty > 0
        ? reverseReceipt(item, m.qty, m.unitCostBaisa, item.name)
        : { qtyOnHand: item.qtyOnHand - m.qty, avgCostBaisa: item.avgCostBaisa },
    )
    await db.items.put({ ...item, ...next, updatedAt: new Date().toISOString() })
    await db.stockMovements.delete(m.id)
  }
}

export interface AdjustmentInput {
  itemId: ID
  date?: string
  type: 'adjustment' | 'waste'
  /** Signed: positive adds stock, negative removes it. Waste must be negative. */
  qty: number
  /** Cost for added stock; defaults to the current average */
  unitCostBaisa?: number
  notes?: string
}

export async function adjustStock(db: FactoryDB, input: AdjustmentInput): Promise<void> {
  if (!input.qty) throw new UserError('أدخل كمية صحيحة')
  if (input.type === 'waste' && input.qty > 0) throw new UserError('التالف يُنقص المخزون فقط')
  await db.transaction('rw', db.items, db.stockMovements, async () => {
    const item = await getItemOrThrow(db, input.itemId)
    await postMovement(db, item, {
      date: input.date ?? today(),
      type: input.type,
      qty: input.qty,
      unitCostBaisa: input.qty > 0 ? (input.unitCostBaisa ?? item.avgCostBaisa) : item.avgCostBaisa,
      refType: 'manual',
      notes: input.notes,
    })
  })
}
