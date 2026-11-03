import { describe, expect, it } from 'vitest'
import { daysUntil, orderProgress, type StepLike, stepState } from './orders'

const step = (kind: StepLike['kind'], sortOrder: number, plannedDate: string | null, doneDate: string | null = null, amountBaisa: number | null = null): StepLike => ({
  kind,
  sortOrder,
  plannedDate,
  doneDate,
  amountBaisa,
})

describe('orders', () => {
  it('tells each stage apart: done, late, soon, planned, open', () => {
    const today = '2026-11-03'
    expect(stepState({ plannedDate: '2026-11-01', doneDate: '2026-11-02' }, today)).toBe('done')
    expect(stepState({ plannedDate: '2026-11-02', doneDate: null }, today)).toBe('late')
    expect(stepState({ plannedDate: '2026-11-06', doneDate: null }, today)).toBe('soon')
    expect(stepState({ plannedDate: '2026-11-20', doneDate: null }, today)).toBe('planned')
    expect(stepState({ plannedDate: null, doneDate: null }, today)).toBe('open')
  })

  it('finds the next stage, the late ones and the payments received', () => {
    const steps = [
      step('approval', 2, '2026-11-01', '2026-11-01'),
      step('quote', 1, null, '2026-10-30'),
      step('production', 3, '2026-11-02'),
      step('delivery', 4, '2026-12-01'),
      step('payment', 5, '2026-11-01', '2026-11-01', 200000),
      step('payment', 6, '2026-12-05', null, 350000),
    ]
    const p = orderProgress(steps, '2026-11-03')
    expect(p).toMatchObject({ done: 3, total: 6, plannedPayBaisa: 550000, paidBaisa: 200000 })
    expect(p.next?.kind).toBe('production')
    expect(p.late.map((s) => s.kind)).toEqual(['production'])
    expect(daysUntil('2026-12-01', '2026-11-03')).toBe(28)
    expect(daysUntil('2026-11-01', '2026-11-03')).toBe(-2)
  })
})
