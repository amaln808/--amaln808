import { describe, expect, it } from 'vitest'
import { priceSale } from './invoice'

describe('priceSale', () => {
  it('matches the database: discount shared by value, VAT per line after discount', () => {
    const r = priceSale(
      [
        { qty: 10, unitPriceBaisa: 1000, vatRate: 5 },
        { qty: 5, unitPriceBaisa: 2000, vatRate: 5 },
      ],
      1001,
    )
    expect(r.lines.map((l) => [l.discountBaisa, l.vatBaisa])).toEqual([[501, 475], [500, 475]])
    expect(r).toMatchObject({ subtotalBaisa: 20000, discountBaisa: 1001, vatBaisa: 950, totalBaisa: 19949 })
  })

  it('is plain arithmetic at 0% VAT and caps the discount at the subtotal', () => {
    expect(priceSale([{ qty: 15, unitPriceBaisa: 1700, vatRate: 0 }], 1000).totalBaisa).toBe(24500)
    expect(priceSale([{ qty: 1, unitPriceBaisa: 500, vatRate: 0 }], 900).discountBaisa).toBe(500)
  })
})
