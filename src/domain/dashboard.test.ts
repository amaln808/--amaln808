import { describe, expect, it } from 'vitest'
import {
  computeKpis,
  type DashboardInput,
  expensesByCategory,
  inventoryValue,
  lowStockItems,
  monthlySeries,
  outstanding,
  topCustomers,
  topProducts,
} from './dashboard'

// Hand-built month: two invoices in October, one in September.
const data: DashboardInput = {
  invoices: [
    {
      id: 'i1', customerId: 'store', date: '2026-10-05', subtotalBaisa: 69000, discountBaisa: 5000, totalBaisa: 64000,
      lines: [{ itemId: 'p250', qty: 30, unitPriceBaisa: 2300, unitCostBaisa: 365 }],
    },
    {
      id: 'i2', customerId: 'mom', date: '2026-10-12', subtotalBaisa: 9000, discountBaisa: 0, totalBaisa: 9000,
      lines: [{ itemId: 'p500', qty: 2, unitPriceBaisa: 4500, unitCostBaisa: 700 }],
    },
    {
      id: 'i3', customerId: 'store', date: '2026-09-20', subtotalBaisa: 23000, discountBaisa: 0, totalBaisa: 23000,
      lines: [{ itemId: 'p250', qty: 10, unitPriceBaisa: 2300, unitCostBaisa: 350 }],
    },
  ],
  customerPayments: [
    { customerId: 'store', date: '2026-10-05', amountBaisa: 20000 },
    { customerId: 'mom', date: '2026-10-12', amountBaisa: 9000 },
    { customerId: 'store', date: '2026-09-25', amountBaisa: 23000 },
  ],
  supplierPayments: [{ supplierId: 'farm', date: '2026-10-02', amountBaisa: 10000 }],
  purchases: [{ supplierId: 'farm', totalBaisa: 33000 }],
  expenses: [
    { categoryId: 'rent', date: '2026-10-01', amountBaisa: 15000 },
    { categoryId: 'power', date: '2026-10-08', amountBaisa: 2500 },
    { categoryId: 'rent', date: '2026-09-01', amountBaisa: 15000 },
  ],
  batches: [
    { date: '2026-10-03', qtyProduced: 40, totalCostBaisa: 14600 },
    { date: '2026-10-09', qtyProduced: 10, totalCostBaisa: 7000 },
  ],
  items: [
    { id: 'dates', type: 'raw', active: true, qtyOnHand: 3, minQty: 10, avgCostBaisa: 1200 },
    { id: 'jar', type: 'packaging', active: true, qtyOnHand: 60, minQty: 50, avgCostBaisa: 45 },
    { id: 'p250', type: 'finished', active: true, qtyOnHand: 10, minQty: 20, avgCostBaisa: 365 },
    { id: 'old', type: 'raw', active: false, qtyOnHand: 1, minQty: 5, avgCostBaisa: 1000 },
  ],
}
const october = { from: '2026-10-01', to: '2026-10-31' }

describe('dashboard KPIs (checked by hand)', () => {
  it('computes profit on an accrual basis', () => {
    const k = computeKpis(data, october)
    // revenue: (69.000 − 5.000) + 9.000 = 73.000
    expect(k.revenueBaisa).toBe(73000)
    // COGS: 30 × 0.365 + 2 × 0.700 = 10.950 + 1.400 = 12.350
    expect(k.cogsBaisa).toBe(12350)
    expect(k.grossProfitBaisa).toBe(60650)
    // expenses 15.000 + 2.500
    expect(k.expensesBaisa).toBe(17500)
    expect(k.netProfitBaisa).toBe(43150)
    expect(k.netMargin).toBeCloseTo(43150 / 73000, 6)
    expect(k.grossMargin).toBeCloseTo(60650 / 73000, 6)
    // production: (14.600 + 7.000) / 50 = 0.432
    expect(k.avgUnitCostBaisa).toBe(432)
    expect(k.unitsSold).toBe(32)
    expect(k.invoiceCount).toBe(2)
  })

  it('computes cash on payment dates', () => {
    const k = computeKpis(data, october)
    expect(k.cashInBaisa).toBe(29000)
    // supplier 10.000 + expenses 17.500
    expect(k.cashOutBaisa).toBe(27500)
  })

  it('handles an empty period without dividing by zero', () => {
    const k = computeKpis(data, { from: '2025-01-01', to: '2025-01-31' })
    expect(k.revenueBaisa).toBe(0)
    expect(k.netMargin).toBeNull()
    expect(k.avgUnitCostBaisa).toBeNull()
  })

  it('builds monthly rows', () => {
    const [sep, oct] = monthlySeries(data, ['2026-09', '2026-10'])
    expect(sep).toMatchObject({ revenueBaisa: 23000, costsBaisa: 3500 + 15000, netProfitBaisa: 4500, netCashBaisa: 8000 })
    expect(oct).toMatchObject({ revenueBaisa: 73000, costsBaisa: 12350 + 17500, netProfitBaisa: 43150, netCashBaisa: 1500 })
  })
})

describe('rankings and balances', () => {
  it('ranks customers and products, spreading discounts over lines', () => {
    expect(topCustomers(data, october)).toEqual([
      { key: 'store', total: 64000 },
      { key: 'mom', total: 9000 },
    ])
    expect(topProducts(data, october)).toEqual([
      { itemId: 'p250', qty: 30, revenueBaisa: 64000 },
      { itemId: 'p500', qty: 2, revenueBaisa: 9000 },
    ])
    expect(expensesByCategory(data, october)).toEqual([
      { key: 'rent', total: 15000 },
      { key: 'power', total: 2500 },
    ])
  })

  it('values stock, flags low items and totals what is owed', () => {
    expect(inventoryValue(data.items)).toEqual({ raw: 3600, packaging: 2700, finished: 3650, total: 9950 })
    expect(lowStockItems(data.items).map((i) => i.id)).toEqual(['dates', 'p250'])
    // customers: 64+9+23 − 20−9−23 = 44 owed by the store; suppliers: 33 − 10 = 23
    expect(outstanding(data)).toEqual({ receivableBaisa: 44000, payableBaisa: 23000 })
  })
})
