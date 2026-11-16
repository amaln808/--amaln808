import { differenceInCalendarDays } from 'date-fns'
import { day } from '../../../src/domain/schedule'

export interface GoalLike {
  target: number
  startDate: string
  endDate: string
}

export type GoalStatus = 'reached' | 'ahead' | 'behind' | 'missed' | 'not_started'

export interface GoalProgress {
  total: number
  /** 0–1 (may pass 1) */
  pct: number
  /** where the total should be today if progress were even over the period */
  expected: number
  expectedPct: number
  status: GoalStatus
  /** days left including today (0 once the end date has passed) */
  daysLeft: number
  /** needed per remaining day to reach the target, when still open */
  perDay: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function goalProgress(goal: GoalLike, amounts: number[], today: string): GoalProgress {
  const total = round2(amounts.reduce((s, a) => s + a, 0))
  const days = differenceInCalendarDays(day(goal.endDate), day(goal.startDate)) + 1
  const elapsed = Math.min(days, Math.max(0, differenceInCalendarDays(day(today), day(goal.startDate)) + 1))
  const expected = round2((goal.target * elapsed) / days)
  const daysLeft = Math.max(0, differenceInCalendarDays(day(goal.endDate), day(today)) + 1)
  const remaining = goal.target - total
  const status: GoalStatus =
    total >= goal.target
      ? 'reached'
      : today < goal.startDate
        ? 'not_started'
        : today > goal.endDate
          ? 'missed'
          : total >= expected
            ? 'ahead'
            : 'behind'
  return {
    total,
    pct: total / goal.target,
    expected,
    expectedPct: expected / goal.target,
    status,
    daysLeft,
    perDay: remaining > 0 && daysLeft > 0 ? round2(remaining / daysLeft) : null,
  }
}
