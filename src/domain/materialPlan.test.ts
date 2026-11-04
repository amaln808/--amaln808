import { describe, expect, it } from 'vitest'
import { materialPlan } from './materialPlan'

// 250 g jar: 0.175 kg dates + 1 jar + 1 lid
const recipes = [
  { productId: 'p250', components: [{ itemId: 'dates', qtyPerUnit: 0.175 }, { itemId: 'jar', qtyPerUnit: 1 }, { itemId: 'lid', qtyPerUnit: 1 }] },
]

describe('material plan from orders (checked by hand)', () => {
  it('serves orders from ready stock first, then works the rest back to materials', () => {
    const plan = materialPlan(
      [
        { id: 'o2', orderNo: 'O-0002', productId: 'p250', qty: 1000, needDate: '2026-11-20' },
        { id: 'o1', orderNo: 'O-0001', productId: 'p250', qty: 500, needDate: '2026-11-10' },
      ],
      recipes,
      new Map([['p250', 300]]), // 300 jars ready: they go to O-0001 (earlier)
      new Map([['dates', 100], ['jar', 2000], ['lid', 500]]),
      new Map([['dates', 1200], ['jar', 180], ['lid', 45]]),
    )
    // To make: 200 for O-0001 + 1000 for O-0002 = 1200 jars
    expect(plan.production).toEqual([
      { productId: 'p250', orderedQty: 1500, readyQty: 300, toMakeQty: 1200, needDate: '2026-11-10', orders: ['O-0001', 'O-0002'], noRecipe: false },
    ])
    const by = new Map(plan.materials.map((m) => [m.itemId, m]))
    // Dates: 1200 × 0.175 = 210 kg, 100 in stock → 110 short; O-0001 needs 35 (covered), so short from O-0002's date
    expect(by.get('dates')).toMatchObject({ neededQty: 210, availableQty: 100, shortQty: 110, shortBy: '2026-11-20', shortCostBaisa: 132000 })
    // Lids: 1200 needed, 500 in stock → 700 short; O-0001's 200 covered
    expect(by.get('lid')).toMatchObject({ neededQty: 1200, shortQty: 700, shortBy: '2026-11-20', shortCostBaisa: 31500 })
    // Jars: enough
    expect(by.get('jar')).toMatchObject({ neededQty: 1200, shortQty: 0, shortBy: null, shortCostBaisa: 0 })
    expect(plan.shortCostBaisa).toBe(132000 + 31500)
    // Shortages first
    expect(plan.materials.at(-1)?.itemId).toBe('jar')
  })

  it('flags a product without a recipe and needs nothing when stock covers the orders', () => {
    const plan = materialPlan(
      [
        { id: 'o1', orderNo: 'O-0001', productId: 'p500', qty: 50, needDate: null },
        { id: 'o2', orderNo: 'O-0002', productId: 'p250', qty: 100, needDate: '2026-11-10' },
      ],
      recipes,
      new Map([['p250', 100]]),
      new Map(),
    )
    expect(plan.production.find((p) => p.productId === 'p500')).toMatchObject({ toMakeQty: 50, noRecipe: true })
    expect(plan.production.find((p) => p.productId === 'p250')).toMatchObject({ toMakeQty: 0 })
    expect(plan.materials).toEqual([])
  })
})
