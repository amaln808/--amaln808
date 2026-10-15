import { t } from '../i18n/index'
import type { FactoryDB } from '../db/db'
import { newRecord, today } from '../db/records'
import type { ID, Item, ItemType } from '../db/types'
import type { Unit } from '../domain/quantity'
import { UserError } from './errors'
import { postMovement } from './stock'

export interface ItemInput {
  name: string
  nameEn?: string
  type: ItemType
  unit: Unit
  minQty: number
  sku?: string
  salePriceBaisa?: number
  packageSizeG?: number
  active?: boolean
}

export interface OpeningStock {
  qty: number
  unitCostBaisa: number
}

/** Creates an item, optionally with an opening balance recorded as an adjustment. */
export async function createItem(db: FactoryDB, input: ItemInput, opening?: OpeningStock): Promise<ID> {
  const name = input.name.trim()
  if (!name) throw new UserError(t("اسم الصنف مطلوب", "Item name is required"))
  return db.transaction('rw', db.items, db.stockMovements, async () => {
    if (await db.items.where('name').equals(name).count()) throw new UserError(t("يوجد صنف بنفس الاسم", "An item with this name exists"))
    const item: Item = newRecord({ active: true, ...input, name, nameEn: input.nameEn?.trim() || undefined, qtyOnHand: 0, avgCostBaisa: 0 })
    await db.items.add(item)
    if (opening && opening.qty > 0) {
      await postMovement(db, item, {
        date: today(),
        type: 'adjustment',
        qty: opening.qty,
        unitCostBaisa: opening.unitCostBaisa,
        refType: 'manual',
        notes: t("رصيد افتتاحي", "Opening balance"),
      })
    }
    return item.id
  })
}

/** Updates descriptive fields only — quantity and cost change through movements. */
export async function updateItem(db: FactoryDB, id: ID, input: ItemInput): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new UserError(t("اسم الصنف مطلوب", "Item name is required"))
  await db.transaction('rw', db.items, db.stockMovements, async () => {
    const item = await db.items.get(id)
    if (!item) throw new UserError(t("الصنف غير موجود", "Item not found"))
    const clash = await db.items.where('name').equals(name).first()
    if (clash && clash.id !== id) throw new UserError(t("يوجد صنف بنفس الاسم", "An item with this name exists"))
    if (item.type !== input.type && (await db.stockMovements.where('itemId').equals(id).count()))
      throw new UserError(t("لا يمكن تغيير نوع صنف له حركات مخزون", "Can't change the type of an item that has stock movements"))
    await db.items.put({ ...item, ...input, name, nameEn: input.nameEn?.trim() || undefined, updatedAt: new Date().toISOString() })
  })
}

/** Deletes an unused item; items with history can only be deactivated. */
export async function deleteItem(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', db.items, db.stockMovements, db.recipes, async () => {
    if (await db.stockMovements.where('itemId').equals(id).count())
      throw new UserError(t("لا يمكن حذف صنف له حركات مخزون — يمكنك إيقافه بدلاً من ذلك", "Can't delete an item with stock movements — deactivate it instead"))
    const usedInRecipe = (await db.recipes.toArray()).some(
      (r) => r.finishedItemId === id || r.components.some((c) => c.itemId === id),
    )
    if (usedInRecipe) throw new UserError(t("الصنف مستخدم في وصفة", "The item is used in a recipe"))
    await db.items.delete(id)
  })
}
