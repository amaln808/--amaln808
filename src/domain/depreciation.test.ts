import { describe, expect, it } from 'vitest'
import { bookValue, breakEvenUnits, currentMonthlyDepreciation, depreciationIn, fixedPerUnit, monthlyDepreciation, payback } from './depreciation'

// 12 000 OMR over 5 years = 200 OMR a month (the owner's example)
const all = { purchaseDate: '2026-09-15', costBaisa: 12_000_000, lifeMonths: 60, residualBaisa: 0 }
const machine = { purchaseDate: '2026-10-01', costBaisa: 6_000_000, lifeMonths: 84, residualBaisa: 960_000 } // 60 000 a month

describe('depreciation', () => {
  it('spreads cost minus end value over the life, from the purchase month', () => {
    expect(monthlyDepreciation(all)).toBe(200_000)
    expect(monthlyDepreciation(machine)).toBe(60_000)
    expect(depreciationIn([all], { from: '2026-10-01', to: '2026-10-31' })).toBe(200_000)
    expect(depreciationIn([all], { from: '2026-01-01', to: '2026-12-31' })).toBe(800_000) // Sep–Dec
    expect(depreciationIn([all, machine], { from: '2026-09-01', to: '2026-09-30' })).toBe(200_000) // machine not yet bought
    expect(currentMonthlyDepreciation([all, machine], '2026-10-28')).toBe(260_000)
    // Nothing after the last month of life (Aug 2031)
    expect(depreciationIn([all], { from: '2031-08-01', to: '2031-08-31' })).toBe(200_000)
    expect(depreciationIn([all], { from: '2031-09-01', to: '2031-12-31' })).toBe(0)
  })

  it('tracks the value left on the books', () => {
    expect(bookValue(all, '2026-10-28')).toEqual({ monthsDone: 2, accumulatedBaisa: 400_000, bookValueBaisa: 11_600_000, finished: false })
    expect(bookValue(all, '2032-01-01')).toMatchObject({ monthsDone: 60, bookValueBaisa: 0, finished: true })
  })

  it('estimates the payback and the break-even', () => {
    expect(payback(12_000_000, 3_000_000, [500_000, 700_000, 600_000])).toEqual({ recoveredBaisa: 3_000_000, leftBaisa: 9_000_000, share: 0.25, monthsLeft: 15 })
    expect(payback(12_000_000, -400_000, [0, -100_000])).toMatchObject({ recoveredBaisa: 0, monthsLeft: null })
    expect(payback(12_000_000, 13_000_000, [])).toMatchObject({ leftBaisa: 0, share: 1, monthsLeft: 0 })
    // 300 OMR expenses + 200 OMR depreciation over 1000 jars = 0.500 a jar; at 1.500 with 0.700 variable: 625 jars
    expect(fixedPerUnit(500_000, 1000)).toBe(500)
    expect(fixedPerUnit(500_000, 0)).toBeNull()
    expect(breakEvenUnits(500_000, 1500, 700)).toBe(625)
    expect(breakEvenUnits(500_000, 700, 700)).toBeNull()
  })
})
