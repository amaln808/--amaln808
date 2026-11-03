import { describe, expect, it } from 'vitest'
import { daysUntil, orderProgress, orderReceivables, type StepLike, stepState } from './orders'

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

  it('counts what is still owed on orders not invoiced yet', () => {
    const base = { orderNo: 'O-0001', customerId: 'c1', status: 'open' as const, invoiceId: null, dueDate: '2026-12-01' }
    const [r] = orderReceivables(
      [
        {
          ...base,
          id: 'o1',
          amountBaisa: 200000,
          steps: [
            { ...step('payment', 1, '2026-11-01', '2026-11-03', 100000), paymentId: 'p1' },
            { ...step('payment', 2, '2026-11-02', null, 100000), paymentId: null },
          ],
        },
        { ...base, id: 'o2', amountBaisa: 50000, invoiceId: 'inv', steps: [] }, // invoiced: the invoice counts instead
        { ...base, id: 'o3', amountBaisa: 50000, status: 'cancelled', steps: [] },
        { ...base, id: 'o4', amountBaisa: null, steps: [] }, // no agreed value
      ],
      '2026-11-03',
    )
    expect(r).toEqual({ orderId: 'o1', orderNo: 'O-0001', customerId: 'c1', leftBaisa: 100000, dueDate: '2026-11-02', overdueBaisa: 100000, paymentIds: ['p1'] })
    // No payment planned: due on delivery, late once it has passed
    const [d] = orderReceivables([{ ...base, id: 'o5', amountBaisa: 80000, steps: [] }], '2026-12-05')
    expect(d).toMatchObject({ leftBaisa: 80000, dueDate: '2026-12-01', overdueBaisa: 80000 })
  })
})

