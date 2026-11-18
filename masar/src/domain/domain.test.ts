import { describe, expect, it } from 'vitest'
import { checkpoints, expectedProgress, goalHealth, goalProgress, goalsOf, kpiProgress, weightedAchievement } from './goals'
import { cycleSlices, scorePercent, suggestedGoalScore } from './reviews'
import { forecastNext, linearFit } from './forecast'
import { canManage, reportsOf, visibleEmployees } from './access'
import { levelsAt, skillGaps, skillGrowth } from './skills'
import { noticesFor } from './alerts'
import { analyze, annualSummary, skillPlan, suggestGoals } from './insights'
import { buildDemo } from '../data/demo'
import type { Goal, Kpi } from './types'
import { DEFAULT_CRITERIA } from './types'

const kpi = (baseline: number, target: number, entries: [string, number][] = []): Kpi => ({
  id: 'k',
  name: 'k',
  unit: '',
  baseline,
  target,
  entries: entries.map(([date, value]) => ({ date, value })),
})
const goal = (p: Partial<Goal>): Goal => ({
  id: 'g',
  orgId: 'o',
  title: 't',
  description: '',
  scope: 'individual',
  employeeIds: ['a'],
  departmentId: null,
  weight: 50,
  start: '2026-01-01',
  end: '2026-12-31',
  period: 'quarterly',
  kpis: [],
  status: 'active',
  createdById: 'x',
  createdAt: '2026-01-01',
  changes: [],
  ...p,
})

describe('goals', () => {
  it('measures progress from baseline to target, also when lower is better', () => {
    expect(kpiProgress(kpi(0, 100, [['2026-03-01', 25]]))).toBe(0.25)
    expect(kpiProgress(kpi(60, 40, [['2026-03-01', 50]]))).toBe(0.5)
    expect(kpiProgress(kpi(0, 10, [['2026-03-01', 15]]))).toBe(1)
    // only entries up to the date count
    expect(kpiProgress(kpi(0, 100, [['2026-03-01', 25], ['2026-06-01', 60]]), '2026-04-01')).toBe(0.25)
  })
  it('averages KPIs and treats a done goal as complete', () => {
    const g = goal({ kpis: [kpi(0, 100, [['2026-02-01', 50]]), kpi(0, 10, [['2026-02-01', 10]])] })
    expect(goalProgress(g)).toBe(0.75)
    expect(goalProgress({ ...g, status: 'done' })).toBe(1)
  })
  it('compares progress with time elapsed', () => {
    const g = goal({ kpis: [kpi(0, 100, [['2026-07-01', 48]])] })
    expect(expectedProgress(g, '2026-07-02')).toBeCloseTo(0.5, 1)
    expect(goalHealth(g, '2026-07-02')).toBe('on_track')
    expect(goalHealth(goal({ kpis: [kpi(0, 100, [['2026-07-01', 30]])] }), '2026-07-02')).toBe('at_risk')
    expect(goalHealth(goal({ kpis: [kpi(0, 100, [['2026-07-01', 10]])] }), '2026-07-02')).toBe('late')
    expect(goalHealth(g, '2027-01-02')).toBe('late')
    expect(goalHealth(g, '2025-12-01')).toBe('not_started')
  })
  it('splits a goal into monthly, quarterly and annual checkpoints', () => {
    expect(checkpoints(goal({ period: 'quarterly' }), '2026-05-01').map((c) => c.label.en)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'])
    expect(checkpoints(goal({ period: 'monthly' }), '2026-05-01')).toHaveLength(12)
    const a = checkpoints(goal({ period: 'annual' }), '2026-05-01')
    expect(a).toHaveLength(1)
    expect(a[0].expected).toBe(1)
    const q = checkpoints(goal({ period: 'quarterly', start: '2026-02-15', end: '2026-08-10' }), '2026-05-01')
    expect(q.map((c) => [c.start, c.end])).toEqual([
      ['2026-02-15', '2026-03-31'],
      ['2026-04-01', '2026-06-30'],
      ['2026-07-01', '2026-08-10'],
    ])
    expect(q[2].actual).toBeNull()
  })
  it('weights achievement by importance', () => {
    const a = goal({ weight: 75, kpis: [kpi(0, 10, [['2026-01-02', 10]])] })
    const b = goal({ weight: 25, kpis: [kpi(0, 10)] })
    expect(weightedAchievement([a, b], '2026-06-01')).toBe(0.75)
    expect(weightedAchievement([], '2026-06-01')).toBeNull()
  })
})

describe('reviews', () => {
  it('turns weighted scores into a percent of the scale', () => {
    const crit = DEFAULT_CRITERIA.slice(0, 2) // goals ×2, quality ×1
    expect(scorePercent({ goals: 5, quality: 2 }, crit, 5)).toBe(80)
    expect(scorePercent({ goals: 8 }, crit, 10)).toBe(80)
    expect(scorePercent({}, crit, 5)).toBeNull()
  })
  it('suggests a goal score from achievement', () => {
    expect(suggestedGoalScore(0.92, 5)).toBe(5)
    expect(suggestedGoalScore(0.6, 10)).toBe(6)
    expect(suggestedGoalScore(0, 5)).toBe(1)
  })
  it('slices the year into 2 or 3 review periods', () => {
    expect(cycleSlices(2026, 3).map((s) => [s.start, s.end, s.due])).toEqual([
      ['2026-01-01', '2026-04-30', '2026-05-15'],
      ['2026-05-01', '2026-08-31', '2026-09-15'],
      ['2026-09-01', '2026-12-31', '2026-12-20'],
    ])
    expect(cycleSlices(2026, 2).map((s) => s.end)).toEqual(['2026-06-30', '2026-12-31'])
  })
})

describe('forecast', () => {
  it('fits a line and damps the next step', () => {
    expect(linearFit([60, 70, 80])).toEqual({ slope: 10, intercept: 60 })
    const f = forecastNext([60, 70, 80])!
    expect(f.value).toBe(85)
    expect(f.trend).toBe('up')
    expect(f.low).toBeLessThan(85)
    expect(forecastNext([90, 95, 100])!.value).toBe(100)
    expect(forecastNext([])).toBeNull()
    expect(forecastNext([70])!.trend).toBe('flat')
  })
})

const db = buildDemo('2026-11-18')
const emp = (id: string) => db.employees.find((e) => e.id === id)!

describe('access', () => {
  it('lets each role see the right people', () => {
    expect(visibleEmployees(emp('e-hr'), db.employees)).toHaveLength(db.employees.length)
    const team = visibleEmployees(emp('e-sales'), db.employees).map((e) => e.id)
    expect(team.sort()).toEqual(['e-s1', 'e-s2', 'e-s3', 'e-sales'])
    expect(visibleEmployees(emp('e-s1'), db.employees).map((e) => e.id)).toEqual(['e-s1'])
    expect(reportsOf('e-ceo', db.employees)).toHaveLength(db.employees.length - 1)
  })
  it('lets managers act only on their team, never on themselves', () => {
    expect(canManage(emp('e-sales'), emp('e-s1'), db.employees)).toBe(true)
    expect(canManage(emp('e-sales'), emp('e-t1'), db.employees)).toBe(false)
    expect(canManage(emp('e-sales'), emp('e-sales'), db.employees)).toBe(false)
    expect(canManage(emp('e-s1'), emp('e-s2'), db.employees)).toBe(false)
  })
})

describe('demo company', () => {
  it('is consistent', () => {
    const ids = new Set(db.employees.map((e) => e.id))
    for (const e of db.employees) {
      if (e.managerId) expect(ids.has(e.managerId)).toBe(true)
      expect(db.positions.some((p) => p.id === e.positionId)).toBe(true)
    }
    for (const e of db.employees) {
      const w = goalsOf(db.goals, e).reduce((s, g) => s + g.weight, 0)
      expect(w).toBeGreaterThanOrEqual(98)
      expect(w).toBeLessThanOrEqual(102)
    }
    expect(db.cycles).toHaveLength(6)
    expect(db.reviews.some((r) => r.cycleId === 'c-2026-3' && r.status !== 'submitted')).toBe(true)
  })
})

describe('skills', () => {
  it('reads the latest level and the gaps for the position', () => {
    const lv = levelsAt(db.skillRecords, 'e-s2', '2026-11-18')
    expect(lv.size).toBeGreaterThan(0)
    const pos = db.positions.find((p) => p.id === emp('e-s2').positionId)
    for (const g of skillGaps(pos, lv)) expect(g.required).toBeGreaterThan(g.current)
    const growth = skillGrowth(db.skillRecords, db.skills, 'e-s2', '2025-01-01', '2026-11-18')
    for (const g of growth) expect(g.delta).toBeGreaterThanOrEqual(0)
  })
})

describe('notices and assistant', () => {
  it('warns about the upcoming review and late goals', () => {
    const n = noticesFor(db, emp('e-hr'), '2026-11-18')
    expect(n.some((x) => x.kind === 'review_due')).toBe(true)
    expect(n.some((x) => x.kind === 'goal_late' || x.kind === 'goal_risk')).toBe(true)
    // an employee is never told about others' goals
    const mine = noticesFor(db, emp('e-c1'), '2026-11-18')
    expect(mine.every((x) => x.kind === 'self_due' || x.detail.ar.includes('حمد') || x.detail.ar.includes('جماعي'))).toBe(true)
  })
  it('suggests goals that fit the job and are not already set', () => {
    const ideas = suggestGoals(db, emp('e-t3'), '2026-11-18')
    const have = new Set(goalsOf(db.goals, emp('e-t3')).map((g) => g.title))
    expect(ideas.length).toBeGreaterThan(0)
    for (const i of ideas) expect(have.has(i.title.ar)).toBe(false)
  })
  it('builds a skill plan, an analysis and an annual summary', () => {
    for (const e of db.employees) {
      const plan = skillPlan(db, e, '2026-11-18')
      for (const s of plan) expect(s.to).toBeGreaterThan(s.from)
      const a = analyze(db, e, '2026-11-18')
      expect(a.recommendations.length).toBeGreaterThan(0)
      const s = annualSummary(db, e, 2026, '2026-11-18')
      expect(s.ar).toContain(e.name)
      expect(s.en.length).toBeGreaterThan(40)
    }
  })
})

describe('notice housekeeping', () => {
  it('does not raise alerts for long-closed cycles or before someone joined', () => {
    const n = noticesFor(db, emp('e-s2'), '2026-11-18')
    expect(n.every((x) => !x.id.includes('c-2025'))).toBe(true)
  })
  it('keeps percent targets within 100', () => {
    for (const e of db.employees)
      for (const i of suggestGoals(db, e, '2026-11-18')) for (const k of i.kpis) if (k.unit.en === '%') expect(k.target).toBeLessThanOrEqual(100)
  })
})

describe('excel export', () => {
  it('covers only the people the viewer may see', async () => {
    const { buildWorkbook } = await import('../export/files')
    const mgr = buildWorkbook(db, emp('e-sales'), '2026-11-18', 'ar')
    expect(mgr.map((s) => s.sheet)).toEqual(['الموظفون', 'الأهداف', 'التقييمات'])
    expect(mgr[0].data).toHaveLength(1 + 4) // header + manager and 3 reps
    const hr = buildWorkbook(db, emp('e-hr'), '2026-11-18', 'en')
    expect(hr[0].data).toHaveLength(1 + db.employees.length)
    expect(hr[2].data.length).toBeGreaterThan(50)
  })
})
