import type { Criterion, Review, ReviewCycle, Scores } from './types'

/** Weighted mean of the filled criteria, as a percent of the scale ("4 of 5" = 80) */
export function scorePercent(scores: Scores, criteria: Criterion[], scale: number): number | null {
  let w = 0
  let s = 0
  for (const c of criteria) {
    const v = scores[c.key]
    if (v == null || !(v > 0)) continue
    w += c.weight
    s += c.weight * (v / scale)
  }
  return w ? Math.round((s / w) * 1000) / 10 : null
}

/** Converts a goal achievement (0..1) to a suggested score on the scale (at least 1) */
export const suggestedGoalScore = (achievement: number, scale: number) =>
  Math.max(1, Math.min(scale, Math.round(achievement * scale)))

export const reviewPercent = (r: Review, criteria: Criterion[], scale: number) =>
  r.status === 'submitted' ? scorePercent(r.scores, criteria, scale) : null

/** Cycles ordered oldest first */
export const sortCycles = (cycles: ReviewCycle[]) => [...cycles].sort((a, b) => a.start.localeCompare(b.start))

/** The employee's submitted reviews, oldest first, with their percent */
export function reviewHistory(employeeId: string, reviews: Review[], cycles: ReviewCycle[], criteria: Criterion[], scale: number) {
  return sortCycles(cycles)
    .map((c) => {
      const r = reviews.find((x) => x.cycleId === c.id && x.employeeId === employeeId && x.status === 'submitted')
      return r ? { cycle: c, review: r, percent: scorePercent(r.scores, criteria, scale)! } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

/** Calendar slices for 2 or 3 reviews a year: Jan–Jun / Jul–Dec, or Jan–Apr / May–Aug / Sep–Dec */
export function cycleSlices(year: number, perYear: 2 | 3) {
  const len = 12 / perYear
  return Array.from({ length: perYear }, (_, i) => {
    const m0 = i * len
    const endD = new Date(year, m0 + len, 0)
    const end = `${year}-${String(m0 + len).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`
    const due = i === perYear - 1 ? `${year}-12-20` : `${year}-${String(m0 + len + 1).padStart(2, '0')}-15`
    return { index: i + 1, start: `${year}-${String(m0 + 1).padStart(2, '0')}-01`, end, due }
  })
}
