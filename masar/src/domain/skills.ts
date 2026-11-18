import type { Position, Skill, SkillLevel, SkillRecord } from './types'

/** Latest level of each skill for an employee on a date */
export function levelsAt(records: SkillRecord[], employeeId: string, date = '9999-12-31'): Map<string, SkillLevel> {
  const last = new Map<string, SkillRecord>()
  for (const r of records) {
    if (r.employeeId !== employeeId || r.date > date) continue
    const p = last.get(r.skillId)
    if (!p || r.date >= p.date) last.set(r.skillId, r)
  }
  return new Map([...last].map(([k, r]) => [k, r.level]))
}

/** Step series per skill (date, level) for growth charts */
export function skillHistory(records: SkillRecord[], employeeId: string, skillId: string) {
  return records
    .filter((r) => r.employeeId === employeeId && r.skillId === skillId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, level: r.level }))
}

export interface SkillGrowth {
  skill: Skill
  first: SkillLevel
  current: SkillLevel
  delta: number
}
export function skillGrowth(records: SkillRecord[], skills: Skill[], employeeId: string, from: string, to: string): SkillGrowth[] {
  const out: SkillGrowth[] = []
  for (const skill of skills) {
    const h = skillHistory(records, employeeId, skill.id)
    if (!h.length) continue
    const before = h.filter((x) => x.date <= from).at(-1) ?? h[0]
    const now = h.filter((x) => x.date <= to).at(-1) ?? before
    out.push({ skill, first: before.level, current: now.level, delta: now.level - before.level })
  }
  return out
}

export interface SkillGap {
  skillId: string
  required: SkillLevel
  current: SkillLevel | 0
  gap: number
}
export function skillGaps(position: Position | undefined, levels: Map<string, SkillLevel>): SkillGap[] {
  if (!position) return []
  return position.requiredSkills
    .map((r) => {
      const current: SkillLevel | 0 = levels.get(r.skillId) ?? 0
      return { skillId: r.skillId, required: r.level, current, gap: r.level - current }
    })
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap - a.gap)
}
