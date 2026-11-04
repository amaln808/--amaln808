import { describe, expect, it } from 'vitest'
import type { DashboardInput } from './dashboard'
import { change, monthlyReport, monthRange, previousMonth, recentMonths } from './monthlyReport'

const inv = (date: string, qty: number, price: number, cost: number, customerId = 'c1') => ({
  id: date + customerId,
  customerId,
  date,
  subtotalBaisa: qty * price,
  discountBaisa: 0,
  totalBaisa: qty * price,
  lines: [{ itemId: 'p250', qty, unitPriceBaisa: price, unitCostBaisa: cost }],
})

describe('monthly report (checked by hand)', () => {
  it('works out month ranges', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2028-02').to).toBe('2028-02-29')
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(recentMonths('2026-02-15', 3)).toEqual(['2026-02', '2026-01', '2025-12'])
    expect(change(150, 100)).toBe(0.5)
    expect(change(-50, -100)).toBe(0.5)
    expect(change(10, 0)).toBeNull()
  })

  it('adds up the month and the month before', () => {
    const d: DashboardInput = {
      // October: 100 jars × 1.500 sold, cost 0.900 → revenue 150, goods sold 90
      invoices: [inv('2026-10-05', 100, 1500, 900), inv('2026-10-31', 20, 1500, 900, 'c2'), inv('2026-09-30', 50, 1500, 900), inv('2026-11-01', 999, 1500, 900)],
      customerPayments: [{ customerId: 'c1', date: '2026-10-10', amountBaisa: 100000 }],
      supplierPayments: [{ supplierId: 's1', date: '2026-10-12', amountBaisa: 40000 }],
      purchases: [],
      expenses: [
        { date: '2026-10-01', amountBaisa: 30000, categoryId: 'rent' },
        { date: '2026-10-20', amountBaisa: 5000, categoryId: 'power' },
      ],
      batches: [{ date: '2026-10-03', qtyProduced: 200, totalCostBaisa: 180000 }],
      items: [],
    }
    const r = monthlyReport(d, '2026-10', {
      purchases: [{ date: '2026-10-02', totalBaisa: 75000 }, { date: '2026-09-02', totalBaisa: 1 }],
      orders: [
        { orderDate: '2026-10-08', status: 'open', amountBaisa: 550000 },
        { orderDate: '2026-10-09', status: 'cancelled', amountBaisa: 1000 },
        { orderDate: '2026-11-01', status: 'open', amountBaisa: 7 },
      ],
    })
    // 120 jars: revenue 180, goods sold 108, expenses 35 → net 37
    expect(r.now).toMatchObject({ revenueBaisa: 180000, cogsBaisa: 108000, expensesBaisa: 35000, netProfitBaisa: 37000, unitsSold: 120, unitsProduced: 200, avgUnitCostBaisa: 900 })
    expect(r.now).toMatchObject({ cashInBaisa: 100000, cashOutBaisa: 75000 })
    expect(r.before).toMatchObject({ revenueBaisa: 75000, netProfitBaisa: 30000 })
    expect(r.expenses).toEqual([{ key: 'rent', total: 30000 }, { key: 'power', total: 5000 }])
    expect(r.customers).toEqual([{ key: 'c1', total: 150000 }, { key: 'c2', total: 30000 }])
    expect(r.products).toEqual([{ itemId: 'p250', qty: 120, revenueBaisa: 180000 }])
    expect(r).toMatchObject({ batches: 1, purchasesBaisa: 75000, orders: { count: 1, valueBaisa: 550000, cancelled: 1 } })
  })
})
