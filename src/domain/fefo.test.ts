import { describe, expect, it } from 'vitest'
import { expiryState, fefoEstimate, planFromRecipe, statement, usableLots } from './fefo'

const lot = (qty: number, cost: number, expiry: string | null, received: string, qc?: string) => ({
  qtyRemaining: qty,
  unitCostBaisa: cost,
  expiryDate: expiry,
  receivedDate: received,
  qcStatus: qc,
})

describe('fefo preview', () => {
  const lots = [
    lot(10, 1000, '2027-06-01', '2026-09-01'),
    lot(5, 1500, '2026-11-01', '2026-09-10'),
    lot(7, 900, '2026-09-30', '2026-08-01'), // expired on 2026-10-05
    lot(4, 800, null, '2026-07-01'),
  ]

  it('orders by nearest expiry, no-expiry last, and drops expired', () => {
    expect(usableLots(lots, '2026-10-05').map((l) => l.unitCostBaisa)).toEqual([1500, 1000, 800])
  })

  it('matches the database: 8 kg = 5 × 1500 + 3 × 1000', () => {
    expect(fefoEstimate(lots, 8, '2026-10-05')).toEqual({ cost: 10500, available: 19, shortage: 0 })
  })

  it('reports the shortage', () => {
    expect(fefoEstimate(lots, 25, '2026-10-05').shortage).toBe(6)
  })

  it('only released lots when selling', () => {
    expect(usableLots([lot(5, 1, null, '2026-01-01', 'pending'), lot(2, 1, null, '2026-01-02', 'passed')], '2026-10-01', true)).toHaveLength(1)
  })
})

describe('expiryState', () => {
  it('classifies', () => {
    expect(expiryState(null, '2026-10-24', 30)).toBe('none')
    expect(expiryState('2026-10-23', '2026-10-24', 30)).toBe('expired')
    expect(expiryState('2026-11-10', '2026-10-24', 30)).toBe('soon')
    expect(expiryState('2027-01-10', '2026-10-24', 30)).toBe('ok')
  })
})

describe('supplier statement', () => {
  it('runs a balance, purchases before payments on the same day', () => {
    const rows = statement([
      { id: 'p2', date: '2026-10-05', kind: 'payment', ref: '', amountBaisa: 30000 },
      { id: 'b1', date: '2026-10-01', kind: 'purchase', ref: 'A', amountBaisa: 60000 },
      { id: 'p1', date: '2026-10-01', kind: 'payment', ref: '', amountBaisa: 10000 },
    ])
    expect(rows.map((r) => [r.id, r.balance])).toEqual([['b1', 60000], ['p1', 50000], ['p2', 20000]])
  })
})

describe('planFromRecipe', () => {
  it('scales the recipe and rounds to grams', () => {
    expect(planFromRecipe([{ itemId: 'd', qtyPerUnit: 0.175 }, { itemId: 'j', qtyPerUnit: 1 }], 120)).toEqual([
      { itemId: 'd', qty: 21 },
      { itemId: 'j', qty: 120 },
    ])
    expect(planFromRecipe([{ itemId: 'n', qtyPerUnit: 0.0753 }], 3)).toEqual([{ itemId: 'n', qty: 0.226 }])
  })
})
