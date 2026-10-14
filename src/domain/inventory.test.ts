import { describe, expect, it } from 'vitest'
import { InsufficientStockError, isLowStock, issue, receive, reverseReceipt, stockValue } from './inventory'
import { balanceDue, buildStatement, linesTotal } from './ledger'

describe('weighted average cost', () => {
  it('first receipt sets the cost', () => {
    expect(receive({ qtyOnHand: 0, avgCostBaisa: 0 }, 10, 1200)).toEqual({ qtyOnHand: 10, avgCostBaisa: 1200 })
  })

  it('blends a second receipt', () => {
    // 10 kg @ 1.200 + 30 kg @ 1.000 → 40 kg @ 1.050
    const s = receive({ qtyOnHand: 10, avgCostBaisa: 1200 }, 30, 1000)
    expect(s).toEqual({ qtyOnHand: 40, avgCostBaisa: 1050 })
  })

  it('ignores a negative balance when blending', () => {
    expect(receive({ qtyOnHand: -2, avgCostBaisa: 900 }, 5, 1000)).toEqual({ qtyOnHand: 3, avgCostBaisa: 1000 })
  })

  it('keeps fractional per-gram costs', () => {
    // 1000 g for 1.234 OMR → 1.234 baisa per gram
    expect(receive({ qtyOnHand: 0, avgCostBaisa: 0 }, 1000, 1.234).avgCostBaisa).toBe(1.234)
  })

  it('issuing keeps the average and blocks overdraw', () => {
    expect(issue({ qtyOnHand: 40, avgCostBaisa: 1050 }, 15)).toEqual({ qtyOnHand: 25, avgCostBaisa: 1050 })
    expect(() => issue({ qtyOnHand: 1, avgCostBaisa: 1 }, 2)).toThrow(InsufficientStockError)
  })

  it('reversing a receipt restores the previous average', () => {
    const after = receive({ qtyOnHand: 10, avgCostBaisa: 1200 }, 30, 1000)
    expect(reverseReceipt(after, 30, 1000)).toEqual({ qtyOnHand: 10, avgCostBaisa: 1200 })
    expect(reverseReceipt({ qtyOnHand: 5, avgCostBaisa: 800 }, 5, 800)).toEqual({ qtyOnHand: 0, avgCostBaisa: 800 })
  })

  it('cannot reverse stock that was already used', () => {
    expect(() => reverseReceipt({ qtyOnHand: 4, avgCostBaisa: 1000 }, 10, 1000)).toThrow(InsufficientStockError)
  })

  it('flags low stock and values inventory', () => {
    expect(isLowStock({ qtyOnHand: 5, minQty: 5 })).toBe(true)
    expect(isLowStock({ qtyOnHand: 6, minQty: 5 })).toBe(false)
    expect(stockValue({ qtyOnHand: 40, avgCostBaisa: 1050 })).toBe(42000)
  })
})

describe('ledger', () => {
  it('computes balance due and running statement', () => {
    expect(balanceDue([10000, 5000], [3000])).toBe(12000)
    const rows = buildStatement([
      { id: 'p1', date: '2026-10-02', createdAt: 'b', kind: 'payment', chargeBaisa: 0, paymentBaisa: 4000 },
      { id: 'i1', date: '2026-10-01', createdAt: 'a', kind: 'invoice', chargeBaisa: 10000, paymentBaisa: 0 },
    ])
    expect(rows.map((r) => [r.id, r.balanceBaisa])).toEqual([
      ['i1', 10000],
      ['p1', 6000],
    ])
  })

  it('sums purchase lines to whole baisa', () => {
    expect(linesTotal([{ qty: 2.5, unitCostBaisa: 1200 }, { qty: 100, unitCostBaisa: 45 }])).toBe(7500)
  })
})
