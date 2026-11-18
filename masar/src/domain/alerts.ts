import { visibleEmployees } from './access'
import { addDays, daysBetween } from './dates'
import { goalHealth, goalsOf } from './goals'
import type { Db, Employee } from './types'
import { L } from './types'

export type NoticeKind = 'review_due' | 'review_overdue' | 'self_due' | 'goal_late' | 'goal_risk' | 'goal_ending'
export interface Notice {
  id: string
  kind: NoticeKind
  severity: 'info' | 'warn' | 'late'
  title: L
  detail: L
  link: string
  date: string
}

const name = (e: Employee) => L(e.name, e.nameEn || e.name)

/** Everything the viewer should be told about today, most urgent first */
export function noticesFor(db: Db, viewer: Employee, today: string): Notice[] {
  const out: Notice[] = []
  const team = visibleEmployees(viewer, db.employees.filter((e) => e.active))
  const others = team.filter((e) => e.id !== viewer.id)

  for (const c of db.cycles) {
    const left = daysBetween(today, c.dueDate)
    const cname = L(c.name, c.nameEn)
    // only the cycle that is open now (or overdue by up to 30 days): older gaps are history, not alerts
    if (today < c.start || left > db.org.reviewAlertDays || left < -30) continue

    // The viewer's own self-assessment
    const mine = db.reviews.find((r) => r.cycleId === c.id && r.employeeId === viewer.id)
    if (viewer.hireDate <= c.end && (!mine || mine.status === 'not_started'))
      out.push({
        id: `self:${c.id}`,
        kind: 'self_due',
        severity: left < 0 ? 'late' : left <= 7 ? 'warn' : 'info',
        title: L('قيّم نفسك', 'Complete your self-assessment'),
        detail: L(`${cname.ar} — ${left < 0 ? `متأخر ${-left} يوماً` : `باقي ${left} يوماً`}`, `${cname.en} — ${left < 0 ? `${-left} days overdue` : `${left} days left`}`),
        link: `/reviews?cycle=${c.id}`,
        date: c.dueDate,
      })
    // Reviews the viewer still owes (managers: their direct team; HR/admin: everyone's outstanding count)
    const owed = others.filter((e) => {
      if (e.hireDate > c.end) return false
      const r = db.reviews.find((x) => x.cycleId === c.id && x.employeeId === e.id)
      if (r?.status === 'submitted') return false
      return viewer.role === 'manager' ? e.managerId === viewer.id : true
    })
    if (owed.length && viewer.role !== 'employee')
      out.push({
        id: `due:${c.id}:${owed.length}`,
        kind: left < 0 ? 'review_overdue' : 'review_due',
        severity: left < 0 ? 'late' : left <= 7 ? 'warn' : 'info',
        title: left < 0 ? L('تقييمات متأخرة', 'Reviews overdue') : L('تقييمات قادمة', 'Reviews coming up'),
        detail: L(
          `${owed.length} موظفاً لم يكتمل تقييمهم في ${cname.ar} — ${left < 0 ? `انتهى الموعد منذ ${-left} يوماً` : `الموعد بعد ${left} يوماً`}`,
          `${owed.length} reviews not finished for ${cname.en} — ${left < 0 ? `due ${-left} days ago` : `due in ${left} days`}`,
        ),
        link: `/reviews?cycle=${c.id}`,
        date: c.dueDate,
      })
  }

  const seen = new Set<string>()
  for (const e of team)
    for (const g of goalsOf(db.goals, e)) {
      if (seen.has(g.id) || g.status !== 'active') continue
      seen.add(g.id)
      const h = goalHealth(g, today, db.org.lateThreshold)
      const who = g.scope === 'team' ? L('هدف جماعي', 'Team goal') : name(e)
      if (h === 'late' || h === 'at_risk')
        out.push({
          id: `goal:${h}:${g.id}`,
          kind: h === 'late' ? 'goal_late' : 'goal_risk',
          severity: h === 'late' ? 'late' : 'warn',
          title: h === 'late' ? L('هدف متأخر', 'Goal behind') : L('هدف يحتاج متابعة', 'Goal at risk'),
          detail: L(`${g.title} — ${who.ar}`, `${g.title} — ${who.en}`),
          link: `/goals/${g.id}`,
          date: g.end,
        })
      else if (h === 'on_track' && g.end <= addDays(today, 14) && g.end >= today)
        out.push({
          id: `ending:${g.id}`,
          kind: 'goal_ending',
          severity: 'info',
          title: L('هدف ينتهي قريباً', 'Goal ending soon'),
          detail: L(`${g.title} — ينتهي بعد ${daysBetween(today, g.end)} يوماً`, `${g.title} — ends in ${daysBetween(today, g.end)} days`),
          link: `/goals/${g.id}`,
          date: g.end,
        })
    }

  const rank = { late: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.date.localeCompare(b.date))
}
