import type { FactoryDB } from './db'
import { newRecord } from './records'
import type { ExpenseCategory, Item, Settings } from './types'

export const SETTINGS_ID = 'main'

const DEFAULT_EXPENSE_CATEGORIES: Array<[string, string]> = [
  ['إيجار', '#8b5cf6'],
  ['كهرباء', '#f59e0b'],
  ['ماء', '#0ea5e9'],
  ['رواتب', '#10b981'],
  ['نقل', '#ef4444'],
  ['تسويق', '#ec4899'],
  ['صيانة', '#64748b'],
  ['رسوم حكومية', '#6366f1'],
  ['أخرى', '#a3a3a3'],
]

type SeedItem = Pick<Item, 'name' | 'type' | 'unit' | 'minQty'> & Partial<Item>

const DEFAULT_ITEMS: SeedItem[] = [
  { name: 'معجون تمر', type: 'raw', unit: 'kg', minQty: 10 },
  { name: 'فول سوداني', type: 'raw', unit: 'kg', minQty: 5 },
  { name: 'علبة 250 جم', type: 'packaging', unit: 'piece', minQty: 50 },
  { name: 'علبة 500 جم', type: 'packaging', unit: 'piece', minQty: 50 },
  { name: 'غطاء علبة', type: 'packaging', unit: 'piece', minQty: 100 },
  { name: 'ملصق', type: 'packaging', unit: 'piece', minQty: 100 },
  {
    name: 'معجون تمر بزبدة الفول السوداني ≈250 جم',
    type: 'finished',
    unit: 'piece',
    minQty: 20,
    packageSizeG: 250,
  },
  {
    name: 'معجون تمر بزبدة الفول السوداني ≈500 جم',
    type: 'finished',
    unit: 'piece',
    minQty: 20,
    packageSizeG: 500,
  },
]

/** Fills an empty database with settings, expense categories and starter items. */
export async function seedIfEmpty(db: FactoryDB): Promise<void> {
  await db.transaction('rw', [db.settings, db.expenseCategories, db.items], async () => {
    if (await db.settings.get(SETTINGS_ID)) return

    const now = new Date().toISOString()
    const settings: Settings = {
      id: SETTINGS_ID,
      createdAt: now,
      updatedAt: now,
      businessName: 'مصنع معجون التمر',
      currency: 'OMR',
      vatRatePercent: 0,
      invoicePrefix: 'INV-',
      batchPrefix: 'B-',
      nextInvoiceNo: 1,
      nextBatchNo: 1,
    }
    await db.settings.add(settings)

    await db.expenseCategories.bulkAdd(
      DEFAULT_EXPENSE_CATEGORIES.map(
        ([name, color]): ExpenseCategory => newRecord({ name, color, isDefault: true }),
      ),
    )

    await db.items.bulkAdd(
      DEFAULT_ITEMS.map(
        (it): Item => newRecord({ qtyOnHand: 0, avgCostBaisa: 0, active: true, ...it }),
      ),
    )
  })
}
