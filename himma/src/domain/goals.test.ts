import { describe, expect, it } from 'vitest'
import { goalProgress } from './goals'

// 30 days, 300 jars → 10 a day
const g = { target: 300, startDate: '2026-11-01', endDate: '2026-11-30' }

describe('goalProgress', () => {
  it('compares the total with an even pace', () => {
    const p = goalProgress(g, [50, 40], '2026-11-10')
    expect(p).toMatchObject({ total: 90, expected: 100, status: 'behind', daysLeft: 21 })
    expect(p.perDay).toBe(10)
    expect(goalProgress(g, [100], '2026-11-10').status).toBe('ahead')
  })
  it('handles reached, missed and not started', () => {
    expect(goalProgress(g, [200, 120], '2026-11-12')).toMatchObject({ status: 'reached', perDay: null })
    expect(goalProgress(g, [10], '2026-12-02')).toMatchObject({ status: 'missed', daysLeft: 0, expected: 300 })
    expect(goalProgress(g, [], '2026-10-20')).toMatchObject({ status: 'not_started', expected: 0 })
  })
  it('accepts corrections', () => {
    expect(goalProgress(g, [50, -5], '2026-11-30').total).toBe(45)
  })
})
