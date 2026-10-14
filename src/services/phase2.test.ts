import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactoryDB } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { UserError } from './errors'
import { createItem } from './items'
import { createBatch, deleteBatch } from './production'
import { saveRecipe, seedEstimatedRecipes } from './recipes'
import { adjustStock } from './stock'

let db: FactoryDB
let n = 0
beforeEach(() => {
  db = new FactoryDB(`phase2-${n++}`)
})
afterEach(() => db.close())

async function stocked() {
  const dates = await createItem(db, { name: 'تمر', type: 'raw', unit: 'kg', minQty: 0 }, { qty: 10, unitCostBaisa: 1200 })
  const peanut = await createItem(db, { name: 'فول', type: 'raw', unit: 'kg', minQty: 0 }, { qty: 3, unitCostBaisa: 900 })
  const jar = await createItem(db, { name: 'علبة', type: 'packaging', unit: 'piece', minQty: 0 }, { qty: 100, unitCostBaisa: 45 })
  const product = await createItem(db, { name: 'منتج 250', type: 'finished', unit: 'piece', minQty: 0, packageSizeG: 250 })
  return { dates, peanut, jar, product }
}

describe('production batches', () => {
  it('consumes materials, adds finished units at computed cost and numbers batches', async () => {
    await seedIfEmpty(db)
    const { dates, peanut, jar, product } = await stocked()
    const id = await createBatch(db, {
      finishedItemId: product,
      date: '2026-10-10',
      qtyProduced: 40,
      consumed: [
        { itemId: dates, qty: 7 },
        { itemId: peanut, qty: 3 },
        { itemId: jar, qty: 40 },
      ],
      extraCostBaisa: 1100,
    })
    const batch = (await db.productionBatches.get(id))!
    expect(batch.batchNo).toBe('B-0001')
    expect(batch).toMatchObject({ materialsCostBaisa: 12900, totalCostBaisa: 14000, unitCostBaisa: 350 })

    expect((await db.items.get(dates))!.qtyOnHand).toBe(3)
    expect((await db.items.get(peanut))!.qtyOnHand).toBe(0)
    expect((await db.items.get(jar))!.qtyOnHand).toBe(60)
    expect(await db.items.get(product)).toMatchObject({ qtyOnHand: 40, avgCostBaisa: 350 })

    const second = await createBatch(db, {
      finishedItemId: product,
      date: '2026-10-11',
      qtyProduced: 10,
      consumed: [{ itemId: jar, qty: 10 }],
    })
    expect((await db.productionBatches.get(second))!.batchNo).toBe('B-0002')
    // 40 @ 0.350 + 10 @ 0.045 → average 0.289
    expect((await db.items.get(product))!.avgCostBaisa).toBe(289)
  })

  it('lists every shortage and changes nothing', async () => {
    const { dates, peanut, jar, product } = await stocked()
    const attempt = createBatch(db, {
      finishedItemId: product,
      date: '2026-10-10',
      qtyProduced: 200,
      consumed: [
        { itemId: dates, qty: 35 },
        { itemId: peanut, qty: 15 },
        { itemId: jar, qty: 200 },
      ],
    })
    await expect(attempt).rejects.toThrow(UserError)
    await expect(attempt).rejects.toThrow(/تمر[\s\S]*فول[\s\S]*علبة/)
    expect((await db.items.get(dates))!.qtyOnHand).toBe(10)
    expect(await db.productionBatches.count()).toBe(0)
    expect(await db.stockMovements.where('type').equals('production_out').count()).toBe(0)
  })

  it('deleting a batch restores materials, unless its units are gone', async () => {
    const { dates, jar, product } = await stocked()
    const input = {
      finishedItemId: product,
      date: '2026-10-10',
      qtyProduced: 10,
      consumed: [
        { itemId: dates, qty: 2 },
        { itemId: jar, qty: 10 },
      ],
    }
    const a = await createBatch(db, input)
    await deleteBatch(db, a)
    expect((await db.items.get(dates))!.qtyOnHand).toBe(10)
    expect((await db.items.get(jar))!.qtyOnHand).toBe(100)
    expect(await db.items.get(product)).toMatchObject({ qtyOnHand: 0 })

    const b = await createBatch(db, input)
    await adjustStock(db, { itemId: product, type: 'waste', qty: -5 })
    await expect(deleteBatch(db, b)).rejects.toThrow(UserError)
    expect(await db.productionBatches.count()).toBe(1)
  })
})

describe('recipes', () => {
  it('seeds estimated recipes once for starter products', async () => {
    await seedIfEmpty(db)
    await seedEstimatedRecipes(db)
    await seedEstimatedRecipes(db)
    const recipes = await db.recipes.toArray()
    expect(recipes).toHaveLength(2)
    expect(recipes.every((r) => r.isEstimate && r.components.length === 5)).toBe(true)

    // deleting all recipes does not bring the estimates back
    await db.recipes.clear()
    await seedEstimatedRecipes(db)
    expect(await db.recipes.count()).toBe(0)
  })

  it('validates and replaces the product recipe, clearing the estimate flag', async () => {
    const { dates, jar, product } = await stocked()
    await expect(saveRecipe(db, { finishedItemId: product, components: [] })).rejects.toThrow(UserError)
    await expect(
      saveRecipe(db, { finishedItemId: product, components: [{ itemId: product, qtyPerUnit: 1 }] }),
    ).rejects.toThrow(UserError)
    await expect(
      saveRecipe(db, { finishedItemId: dates, components: [{ itemId: jar, qtyPerUnit: 1 }] }),
    ).rejects.toThrow(UserError)

    const id = await saveRecipe(db, { finishedItemId: product, components: [{ itemId: dates, qtyPerUnit: 0.2 }] })
    await db.recipes.update(id, { isEstimate: true })
    const again = await saveRecipe(db, {
      finishedItemId: product,
      components: [
        { itemId: dates, qtyPerUnit: 0.18 },
        { itemId: jar, qtyPerUnit: 1 },
      ],
    })
    expect(again).toBe(id)
    expect(await db.recipes.get(id)).toMatchObject({ isEstimate: false, components: [{ qtyPerUnit: 0.18 }, { qtyPerUnit: 1 }] })
  })
})
