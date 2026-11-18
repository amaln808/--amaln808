import { addDays, daysBetween, iso, minIso, parse } from './dates'
import type { Employee, Goal, GoalPeriod, Kpi } from './types'
import { L } from './types'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** The KPI's value on a date: the last entry on or before it, else the baseline */
export function kpiValueAt(kpi: Kpi, date: string): number {
  let v = kpi.baseline
  let at = ''
  for (const e of kpi.entries) if (e.date <= date && e.date >= at) ((v = e.value), (at = e.date))
  return v
}

/** 0..1: how far from baseline to target (works for "lower is better" targets too) */
export function kpiProgress(kpi: Kpi, date = '9999-12-31'): number {
  const v = kpiValueAt(kpi, date)
  if (kpi.target === kpi.baseline) return v === kpi.target ? 1 : 0
  return clamp01((v - kpi.baseline) / (kpi.target - kpi.baseline))
}

export function goalProgress(goal: Goal, date = '9999-12-31'): number {
  if (goal.status === 'done') return 1
  if (!goal.kpis.length) return 0
  return goal.kpis.reduce((s, k) => s + kpiProgress(k, date), 0) / goal.kpis.length
}

/** Share of the goal's time that has passed (0..1) */
export function expectedProgress(goal: Goal, today: string): number {
  const total = daysBetween(goal.start, goal.end)
  if (total <= 0) return today >= goal.end ? 1 : 0
  return clamp01(daysBetween(goal.start, today) / total)
}

export type Health = 'done' | 'on_track' | 'at_risk' | 'late' | 'not_started' | 'cancelled'
export function goalHealth(goal: Goal, today: string, threshold = 15): Health {
  if (goal.status === 'cancelled') return 'cancelled'
  const p = goalProgress(goal, today)
  if (goal.status === 'done' || p >= 1) return 'done'
  if (today < goal.start) return 'not_started'
  if (today > goal.end) return 'late'
  const gap = (expectedProgress(goal, today) - p) * 100
  if (gap <= threshold) return 'on_track'
  return gap <= threshold * 2 ? 'at_risk' : 'late'
}
export const HEALTH: Record<Health, L> = {
  done: L('مكتمل', 'Done'),
  on_track: L('على المسار', 'On track'),
  at_risk: L('يحتاج متابعة', 'At risk'),
  late: L('متأخر', 'Behind'),
  not_started: L('لم يبدأ', 'Not started'),
  cancelled: L('ملغى', 'Cancelled'),
}

/** Is this goal one of the employee's? Team goals reach their listed members, or the whole department */
export function isGoalOf(goal: Goal, emp: Employee): boolean {
  if (goal.employeeIds.includes(emp.id)) return true
  return goal.scope === 'team' && !goal.employeeIds.length && goal.departmentId === emp.departmentId
}
export const goalsOf = (goals: Goal[], emp: Employee) => goals.filter((g) => g.status !== 'cancelled' && isGoalOf(g, emp))

/** Weighted achievement of a set of goals on a date (0..1); null when there is nothing to measure */
export function weightedAchievement(goals: Goal[], date: string): number | null {
  const live = goals.filter((g) => g.status !== 'cancelled' && g.start <= date)
  const w = live.reduce((s, g) => s + g.weight, 0)
  if (!w) return null
  return live.reduce((s, g) => s + g.weight * goalProgress(g, date), 0) / w
}

/** What the employee should have reached by now if every goal moved evenly */
export function weightedExpected(goals: Goal[], date: string): number | null {
  const live = goals.filter((g) => g.status !== 'cancelled' && g.start <= date)
  const w = live.reduce((s, g) => s + g.weight, 0)
  if (!w) return null
  return live.reduce((s, g) => s + g.weight * expectedProgress(g, date), 0) / w
}

export interface Checkpoint {
  label: L
  start: string
  end: string
  /** progress the goal should have by the end of this slice */
  expected: number
  /** progress actually reached by the end of the slice (or today); null for future slices */
  actual: number | null
}

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m0: number) => L(MONTHS_AR[m0], MONTHS_EN[m0])

/** Splits a goal into monthly / quarterly / annual checkpoints */
export function checkpoints(goal: Goal, today: string): Checkpoint[] {
  const out: Checkpoint[] = []
  const step = { monthly: 1, quarterly: 3, annual: 12 }[goal.period as GoalPeriod]
  let cur = goal.start
  let guard = 0
  while (cur <= goal.end && guard++ < 120) {
    const d = parse(cur)
    let endD: Date
    if (goal.period === 'annual') endD = new Date(d.getFullYear(), 11, 31)
    else {
      const startMonth = goal.period === 'quarterly' ? Math.floor(d.getMonth() / 3) * 3 : d.getMonth()
      endD = new Date(d.getFullYear(), startMonth + step, 0)
    }
    const end = minIso(iso(endD), goal.end)
    const label =
      goal.period === 'monthly'
        ? L(`${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`, `${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`)
        : goal.period === 'quarterly'
          ? L(`الربع ${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`, `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`)
          : L(`سنة ${d.getFullYear()}`, `${d.getFullYear()}`)
    out.push({
      label,
      start: cur,
      end,
      expected: expectedProgress(goal, end),
      actual: cur > today ? null : goalProgress(goal, minIso(end, today)),
    })
    cur = addDays(end, 1)
  }
  return out
}

/** Year-end projection at the current pace (0..1+, capped at 1) */
export function projectedProgress(goal: Goal, today: string): number {
  const p = goalProgress(goal, today)
  const e = expectedProgress(goal, today)
  if (e <= 0) return p
  return Math.min(1, p / e)
}
