import { describe, expect, it } from 'vitest'
import { quarterOf, quarterRange, vatSummary } from './vat'

describe('vat quarters', () => {
  it('gives quarter dates, including February in a leap year', () => {
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(quarterRange(2028, 1)).toEqual({ from: '2028-01-01', to: '2028-03-31' })
    expect(quarterRange(2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' })
    expect(quarterOf('2026-10-26')).toEqual({ year: 2026, quarter: 4 })
  })

  it('nets output against input VAT inside the quarter only', () => {
    const r = quarterRange(2026, 4)
    expect(
      vatSummary(
        [{ date: '2026-10-05', vatBaisa: 950 }, { date: '2026-09-30', vatBaisa: 999 }],
        [{ date: '2026-11-01', vatBaisa: 300 }, { date: '2027-01-01', vatBaisa: 50 }],
        r,
      ),
    ).toEqual({ outputBaisa: 950, inputBaisa: 300, netBaisa: 650 })
  })
})
