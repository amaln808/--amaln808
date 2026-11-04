import { describe, expect, it } from 'vitest'
import { compareSupplierPrices, type PriceLine } from './supplierPrices'

const line = (supplierId: string, date: string, qty: number, unitCostBaisa: number, itemId = 'dates', vatRate = 0): PriceLine => ({ itemId, supplierId, date, seq: date, qty, unitCostBaisa, vatRate })

describe('supplier price comparison (checked by hand)', () => {
  const lines = [
    line('A', '2026-09-01', 100, 1200),
    line('B', '2026-09-15', 50, 1000),
    line('A', '2026-10-01', 300, 1100),
    line('C', '2026-10-20', 20, 1300, 'dates', 5),
    line('A', '2026-10-25', 0, 1, 'dates'), // no quantity: ignored
    line('A', '2026-10-01', 10, 50, 'lids'),
  ]

  it('compares each supplier on its last price, cheapest first', () => {
    const [dates] = compareSupplierPrices(lines, true).filter((x) => x.itemId === 'dates')
    expect(dates.suppliers).toEqual([
      { supplierId: 'B', lastBaisa: 1000, lastDate: '2026-09-15', minBaisa: 1000, avgBaisa: 1000, purchases: 1, qty: 50 },
      // (100 × 1.2 + 300 × 1.1) / 400 = 1.125
      { supplierId: 'A', lastBaisa: 1100, lastDate: '2026-10-01', minBaisa: 1100, avgBaisa: 1125, purchases: 2, qty: 400 },
      // VAT 5% counts when not registered: 1.300 × 1.05 = 1.365
      { supplierId: 'C', lastBaisa: 1365, lastDate: '2026-10-20', minBaisa: 1365, avgBaisa: 1365, purchases: 1, qty: 20 },
    ])
    // Latest purchase was from C at 1.365 against B's 1.000 → 37% more; first price 1.200 → +14%
    expect(dates).toMatchObject({ cheapestId: 'B', lastSupplierId: 'C', overpaidPct: 37, trendPct: 14 })
  })

  it('leaves VAT out once registered, and has no trend for a single purchase', () => {
    const r = compareSupplierPrices(lines, false)
    expect(r.find((x) => x.itemId === 'dates')!.suppliers.at(-1)).toMatchObject({ supplierId: 'C', lastBaisa: 1300 })
    expect(r.find((x) => x.itemId === 'lids')).toMatchObject({ cheapestId: 'A', overpaidPct: 0, trendPct: null })
  })
})
