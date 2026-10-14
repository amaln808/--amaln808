import { describe, expect, it } from 'vitest'
import { inRange, monthLabel, monthsInRange, periodRange, totalsBy } from './periods'

describe('periods', () => {
  it('resolves named periods', () => {
    expect(periodRange('thisMonth', '2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('last3Months', '2026-02-14')).toEqual({ from: '2025-12-01', to: '2026-02-28' })
    expect(periodRange('thisYear', '2026-10-14')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodRange('thisMonth', '2028-02-03').to).toBe('2028-02-29')
  })

  it('checks ranges inclusively', () => {
    const r = { from: '2026-10-01', to: '2026-10-31' }
    expect(inRange('2026-10-01', r)).toBe(true)
    expect(inRange('2026-10-31', r)).toBe(true)
    expect(inRange('2026-11-01', r)).toBe(false)
  })

  it('lists months in a range', () => {
    expect(monthsInRange({ from: '2025-11-15', to: '2026-02-03' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(monthLabel('2026-10')).toBe('أكتوبر 2026')
  })

  it('totals by key, largest first', () => {
    const rows = [
      { c: 'rent', a: 150000 },
      { c: 'power', a: 20000 },
      { c: 'power', a: 25000 },
    ]
    expect(totalsBy(rows, (r) => r.c, (r) => r.a)).toEqual([
      { key: 'rent', total: 150000 },
      { key: 'power', total: 45000 },
    ])
  })
})
