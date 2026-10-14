import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactoryDB } from '../db/db'
import { UserError } from './errors'
import { createItem, deleteItem, updateItem } from './items'
import { createPurchase, deletePurchase } from './purchases'
import { adjustStock } from './stock'
import {
  deleteSupplier,
  recordSupplierPayment,
  saveSupplier,
  supplierBalances,
  supplierStatement,
} from './suppliers'

let db: FactoryDB
let n = 0

beforeEach(() => {
  db = new FactoryDB(`phase1-${n++}`)
})
afterEach(() => db.close())

async function setup() {
  const dates = await createItem(db, { name: 'معجون تمر', type: 'raw', unit: 'kg', minQty: 10 })
  const jars = await createItem(db, { name: 'علبة', type: 'packaging', unit: 'piece', minQty: 50 })
  const supplier = await saveSupplier(db, { name: 'مورد التمور', phone: '99999999' })
  return { dates, jars, supplier }
}

describe('purchases', () => {
  it('adds stock, blends cost and tracks what we owe', async () => {
    const { dates, jars, supplier } = await setup()
    await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-01',
      lines: [
        { itemId: dates, qty: 10, unitCostBaisa: 1200 },
        { itemId: jars, qty: 100, unitCostBaisa: 45 },
      ],
      paidNow: { amountBaisa: 5000, method: 'cash' },
    })
    await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-05',
      lines: [{ itemId: dates, qty: 30, unitCostBaisa: 1000 }],
    })

    const item = (await db.items.get(dates))!
    expect(item.qtyOnHand).toBe(40)
    expect(item.avgCostBaisa).toBe(1050)

    // 12.000 + 4.500 + 30.000 − 5.000 paid
    expect((await supplierBalances(db)).get(supplier)).toBe(41500)

    await recordSupplierPayment(db, { supplierId: supplier, date: '2026-10-06', amountBaisa: 1500, method: 'bank' })
    const statement = await supplierStatement(db, supplier)
    expect(statement.at(-1)!.balanceBaisa).toBe(40000)
    expect(await db.stockMovements.count()).toBe(3)
  })

  it('deleting a purchase reverses stock and linked payments', async () => {
    const { dates, supplier } = await setup()
    await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-01',
      lines: [{ itemId: dates, qty: 10, unitCostBaisa: 1200 }],
    })
    const second = await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-02',
      lines: [{ itemId: dates, qty: 30, unitCostBaisa: 1000 }],
      paidNow: { amountBaisa: 30000, method: 'cash' },
    })
    await deletePurchase(db, second)

    expect(await db.items.get(dates)).toMatchObject({ qtyOnHand: 10, avgCostBaisa: 1200 })
    expect(await db.supplierPayments.count()).toBe(0)
    expect((await supplierBalances(db)).get(supplier)).toBe(12000)
  })

  it('refuses to delete a purchase whose stock was used, leaving data intact', async () => {
    const { dates, supplier } = await setup()
    const id = await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-01',
      lines: [{ itemId: dates, qty: 10, unitCostBaisa: 1200 }],
    })
    await adjustStock(db, { itemId: dates, type: 'waste', qty: -4 })
    await expect(deletePurchase(db, id)).rejects.toThrow(UserError)
    expect(await db.purchases.count()).toBe(1)
    expect((await db.items.get(dates))!.qtyOnHand).toBe(6)
  })

  it('validates input and rolls back on a bad line', async () => {
    const { dates, supplier } = await setup()
    const finished = await createItem(db, { name: 'منتج', type: 'finished', unit: 'piece', minQty: 0 })
    await expect(
      createPurchase(db, {
        supplierId: supplier,
        date: '2026-10-01',
        lines: [
          { itemId: dates, qty: 5, unitCostBaisa: 1000 },
          { itemId: finished, qty: 1, unitCostBaisa: 1 },
        ],
      }),
    ).rejects.toThrow(UserError)
    expect(await db.purchases.count()).toBe(0)
    expect((await db.items.get(dates))!.qtyOnHand).toBe(0)
    await expect(createPurchase(db, { supplierId: supplier, date: '2026-10-01', lines: [] })).rejects.toThrow(
      UserError,
    )
  })
})

describe('items and adjustments', () => {
  it('records an opening balance and blocks over-issuing', async () => {
    const id = await createItem(
      db,
      { name: 'فول سوداني', type: 'raw', unit: 'kg', minQty: 5 },
      { qty: 20, unitCostBaisa: 900 },
    )
    expect(await db.items.get(id)).toMatchObject({ qtyOnHand: 20, avgCostBaisa: 900 })

    await adjustStock(db, { itemId: id, type: 'adjustment', qty: 5, unitCostBaisa: 1200 })
    expect(await db.items.get(id)).toMatchObject({ qtyOnHand: 25, avgCostBaisa: 960 })

    await expect(adjustStock(db, { itemId: id, type: 'waste', qty: -30 })).rejects.toThrow(/غير كافية/)
    await expect(adjustStock(db, { itemId: id, type: 'waste', qty: 3 })).rejects.toThrow(UserError)
  })

  it('protects items and suppliers that have history', async () => {
    const { dates, supplier } = await setup()
    await createPurchase(db, {
      supplierId: supplier,
      date: '2026-10-01',
      lines: [{ itemId: dates, qty: 1, unitCostBaisa: 1 }],
    })
    await expect(deleteItem(db, dates)).rejects.toThrow(UserError)
    await expect(deleteSupplier(db, supplier)).rejects.toThrow(UserError)
    await expect(
      updateItem(db, dates, { name: 'معجون تمر', type: 'finished', unit: 'kg', minQty: 0 }),
    ).rejects.toThrow(UserError)
    await expect(createItem(db, { name: 'معجون تمر', type: 'raw', unit: 'kg', minQty: 0 })).rejects.toThrow(
      /بنفس الاسم/,
    )
  })
})
