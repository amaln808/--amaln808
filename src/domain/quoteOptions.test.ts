import { describe, expect, it } from 'vitest'
import { optionPrice, optionTotals } from './quoteOptions'

describe('quotation price options', () => {
  it('applies the option % to each unit price, to the whole baisa', () => {
    expect(optionPrice(1500, -5)).toBe(1425)
    expect(optionPrice(1500, 5)).toBe(1575)
    expect(optionPrice(1333, -10)).toBe(1200)
    expect(optionTotals([{ qty: 10, unitPriceBaisa: 1500 }, { qty: 2, unitPriceBaisa: 2800 }], 500, 5)).toEqual({ prices: [1575, 2940], totalBaisa: 15750 + 5880 - 500 })
  })
})
