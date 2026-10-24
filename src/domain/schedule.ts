import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  differenceInCalendarYears,
  format,
  getDaysInMonth,
  parseISO,
} from 'date-fns'

/** Calendar dates are 'YYYY-MM-DD' strings everywhere; these helpers keep them local (no time zone shifts). */
export const iso = (d: Date) => format(d, 'yyyy-MM-dd')
export const day = (s: string) => parseISO(s)

export type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface TaskRule {
  recurrence: Recurrence
  intervalN: number
  startDate: string
  endDate?: string | null
  /** weekly: 0 = Sunday … 6 = Saturday; empty = the start date's weekday */
  weekdays?: number[] | null
}

/** Monthly/yearly tasks on the 29th–31st fall on the month's last day when it is shorter. */
function clampedDay(wanted: number, d: Date) {
  return Math.min(wanted, getDaysInMonth(d))
}

/** Does the task fall due on this date? */
export function occursOn(rule: TaskRule, date: string): boolean {
  if (date < rule.startDate || (rule.endDate && date > rule.endDate)) return false
  const s = day(rule.startDate)
  const d = day(date)
  const n = Math.max(1, rule.intervalN || 1)
  switch (rule.recurrence) {
    case 'once':
      return date === rule.startDate
    case 'daily':
      return differenceInCalendarDays(d, s) % n === 0
    case 'weekly': {
      const days = rule.weekdays?.length ? rule.weekdays : [s.getDay()]
      return days.includes(d.getDay()) && differenceInCalendarWeeks(d, s, { weekStartsOn: 0 }) % n === 0
    }
    case 'monthly':
      return d.getDate() === clampedDay(s.getDate(), d) && differenceInCalendarMonths(d, s) % n === 0
    case 'yearly':
      return (
        d.getMonth() === s.getMonth() &&
        d.getDate() === clampedDay(s.getDate(), d) &&
        differenceInCalendarYears(d, s) % n === 0
      )
  }
}

/** Every due date from `from` to `to` (inclusive). */
export function occurrencesBetween(rule: TaskRule, from: string, to: string): string[] {
  const out: string[] = []
  const start = from < rule.startDate ? rule.startDate : from
  for (let d = day(start); iso(d) <= to; d = addDays(d, 1)) {
    const s = iso(d)
    if (rule.endDate && s > rule.endDate) break
    if (occursOn(rule, s)) out.push(s)
  }
  return out
}

/** First due date on or after `from` (searches up to ~10 years), or null when none is left. */
export function nextOccurrence(rule: TaskRule, from: string): string | null {
  const start = from < rule.startDate ? rule.startDate : from
  const limit = iso(addMonths(day(start), 12 * Math.max(1, rule.intervalN) + 1))
  for (let d = day(start); iso(d) <= limit; d = addDays(d, 1)) {
    const s = iso(d)
    if (rule.endDate && s > rule.endDate) return null
    if (occursOn(rule, s)) return s
  }
  return null
}

/** Latest due date strictly before `before`, looking back at most `lookbackDays`. */
export function previousOccurrence(rule: TaskRule, before: string, lookbackDays = 400): string | null {
  for (let i = 1; i <= lookbackDays; i++) {
    const s = iso(addDays(day(before), -i))
    if (s < rule.startDate) return null
    if (occursOn(rule, s)) return s
  }
  return null
}

export interface TaskLike extends TaskRule {
  id: string
  active: boolean
}

export interface DueItem<T> {
  task: T
  date: string
  done: boolean
  overdue: boolean
}

/**
 * What needs doing today: every task due today (done or not), plus — for tasks
 * that are not daily — the last missed occurrence, if it was never done and the
 * task was not done since. Daily tasks don't pile up: only today counts.
 */
export function dueToday<T extends TaskLike>(tasks: T[], doneKeys: Set<string>, today: string): DueItem<T>[] {
  const items: DueItem<T>[] = []
  for (const task of tasks) {
    if (!task.active) continue
    if (occursOn(task, today)) items.push({ task, date: today, done: doneKeys.has(`${task.id}|${today}`), overdue: false })
    if (task.recurrence === 'daily') continue
    const prev = previousOccurrence(task, today)
    if (prev && !doneKeys.has(`${task.id}|${prev}`)) {
      // done later (e.g. a weekly task finished a day late) counts as caught up
      const caughtUp = [...doneKeys].some((k) => k.startsWith(`${task.id}|`) && k.slice(task.id.length + 1) > prev)
      if (!caughtUp) items.push({ task, date: prev, done: false, overdue: true })
    }
  }
  return items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date))
}

/** Due dates in the next `days` days after today (for the "coming up" list). */
export function upcoming<T extends TaskLike>(tasks: T[], today: string, days: number): DueItem<T>[] {
  const from = iso(addDays(day(today), 1))
  const to = iso(addDays(day(today), days))
  return tasks
    .filter((t) => t.active)
    .flatMap((task) => occurrencesBetween(task, from, to).map((date) => ({ task, date, done: false, overdue: false })))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Agreements ──────────────────────────────────────────────────────

export type AgreementStatus = 'active' | 'expiring' | 'expired'

export interface AgreementLike {
  endDate: string
  alertDays: number
}

export function agreementStatus(a: AgreementLike, today: string): { status: AgreementStatus; daysLeft: number } {
  const daysLeft = differenceInCalendarDays(day(a.endDate), day(today))
  return { status: daysLeft < 0 ? 'expired' : daysLeft <= a.alertDays ? 'expiring' : 'active', daysLeft }
}

/** Length of an agreement in whole years / months / days (end date inclusive). */
export function durationParts(start: string, end: string): { years: number; months: number; days: number } {
  const s = day(start)
  const e = addDays(day(end), 1)
  let months = differenceInCalendarMonths(e, s)
  if (addMonths(s, months) > e) months--
  const days = differenceInCalendarDays(e, addMonths(s, months))
  return { years: Math.floor(months / 12), months: months % 12, days }
}

/** End date for a start date and a length in months (e.g. 12 → one day before the same date next year). */
export function endAfterMonths(start: string, months: number): string {
  return iso(addDays(addMonths(day(start), months), -1))
}
