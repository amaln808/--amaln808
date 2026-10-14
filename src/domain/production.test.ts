import { describe, expect, it } from 'vitest'
import {
  computeBatchCost,
  findShortages,
  formatDocNo,
  mergeConsumption,
  recipeUnitCost,
  suggestConsumption,
} from './production'

const recipe = [
  { itemId: 'dates', qtyPerUnit: 0.175 },
  { itemId: 'peanut', qtyPerUnit: 0.075 },
  { itemId: 'jar', qtyPerUnit: 1 },
]

describe('production costing', () => {
  it('scales the recipe to the batch size', () => {
    expect(suggestConsumption(recipe, 40)).toEqual([
      { itemId: 'dates', qty: 7 },
      { itemId: 'peanut', qty: 3 },
      { itemId: 'jar', qty: 40 },
    ])
  })

  it('merges duplicate lines and drops empty ones', () => {
    expect(
      mergeConsumption([
        { itemId: 'dates', qty: 1.1 },
        { itemId: 'dates', qty: 0.2 },
        { itemId: 'jar', qty: 0 },
        { itemId: '', qty: 5 },
      ]),
    ).toEqual([{ itemId: 'dates', qty: 1.3 }])
  })

  it('reports shortages per item', () => {
    const stock = new Map([
      ['dates', 10],
      ['jar', 30],
    ])
    expect(findShortages(suggestConsumption(recipe, 40), stock)).toEqual([
      { itemId: 'peanut', available: 0, required: 3 },
      { itemId: 'jar', available: 30, required: 40 },
    ])
  })

  it('computes unit cost from materials plus direct extras', () => {
    // 7 kg × 1.200 + 3 kg × 0.900 + 40 × 0.045 = 8.4 + 2.7 + 1.8 = 12.900; + 1.100 gas = 14.000 / 40 = 0.350
    const cost = computeBatchCost(
      [
        { itemId: 'dates', qty: 7, unitCostBaisa: 1200 },
        { itemId: 'peanut', qty: 3, unitCostBaisa: 900 },
        { itemId: 'jar', qty: 40, unitCostBaisa: 45 },
      ],
      1100,
      40,
    )
    expect(cost).toEqual({ materialsCostBaisa: 12900, extraCostBaisa: 1100, totalCostBaisa: 14000, unitCostBaisa: 350 })
  })

  it('keeps fractional unit cost', () => {
    expect(computeBatchCost([{ itemId: 'x', qty: 1, unitCostBaisa: 1000 }], 0, 3).unitCostBaisa).toBe(333.333)
    expect(() => computeBatchCost([], 0, 0)).toThrow()
  })

  it('estimates recipe cost per unit and formats batch numbers', () => {
    const avg = new Map([
      ['dates', 1200],
      ['peanut', 900],
      ['jar', 45],
    ])
    expect(recipeUnitCost(recipe, avg)).toBe(322.5)
    expect(formatDocNo('B-', 7)).toBe('B-0007')
  })
})
