import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import { day, iso, occurrencesBetween, type TaskRule } from '../../../src/domain/schedule'

export type Scope = 'work' | 'personal'

export interface PTask extends TaskRule {
  id: string
  scope: Scope
  /** stopped from this date on; earlier occurrences still count */
  archivedOn?: string | null
}

export interface PDone {
  taskId: string
  dueDate: string
}

export const doneKey = (taskId: string, date: string) => `${taskId}|${date}`
export const doneSet = (done: PDone[]) => new Set(done.map((d) => doneKey(d.taskId, d.dueDate)))

/** Is the task still running on this date? */
export const activeOn = (t: { archivedOn?: string | null }, date: string) => !t.archivedOn || date < t.archivedOn

export interface Occurrence {
  taskId: string
  scope: Scope
  date: string
}

/** Every planned occurrence between two dates (inclusive), skipping dates after a task was stopped. */
export function planned(tasks: PTask[], from: string, to: string): Occurrence[] {
  if (to < from) return []
  return tasks.flatMap((t) =>
    occurrencesBetween(t, from, to)
      .filter((d) => activeOn(t, d))
      .map((date) => ({ taskId: t.id, scope: t.scope, date })),
  )
}

export interface Stats {
  planned: number
  done: number
  /** 0–1, or null when nothing was planned */
  rate: number | null
}

export function stats(occ: Occurrence[], done: Set<string>): Stats {
  const d = occ.filter((o) => done.has(doneKey(o.taskId, o.date))).length
  return { planned: occ.length, done: d, rate: occ.length ? d / occ.length : null }
}

export interface PeriodStats extends Stats {
  work: Stats
  personal: Stats
}

/** Completion for a period — future days are not counted yet. */
export function periodStats(tasks: PTask[], done: Set<string>, from: string, to: string, today: string): PeriodStats {
  const occ = planned(tasks, from, to < today ? to : today)
  return {
    ...stats(occ, done),
    work: stats(occ.filter((o) => o.scope === 'work'), done),
    personal: stats(occ.filter((o) => o.scope === 'personal'), done),
  }
}

/** Weeks start on Sunday (the working week in Oman). */
export const weekStart = (date: string) => iso(startOfWeek(day(date), { weekStartsOn: 0 }))

export interface DayCell extends Stats {
  date: string
  future: boolean
}

/** Sunday → Saturday of the week holding `today`. Future days show what is planned, with no rate. */
export function weekDays(tasks: PTask[], done: Set<string>, today: string): DayCell[] {
  const start = day(weekStart(today))
  return Array.from({ length: 7 }, (_, i) => {
    const date = iso(addDays(start, i))
    const s = stats(planned(tasks, date, date), done)
    return { ...s, date, future: date > today, rate: date > today ? null : s.rate }
  })
}

export interface WeekRow extends PeriodStats {
  start: string
}

/** The last `weeks` weeks, oldest first, the current week counted up to today. */
export function weeklySeries(tasks: PTask[], done: Set<string>, today: string, weeks: number): WeekRow[] {
  const first = day(weekStart(today))
  return Array.from({ length: weeks }, (_, i) => {
    const start = iso(addDays(first, -7 * (weeks - 1 - i)))
    return { start, ...periodStats(tasks, done, start, iso(addDays(day(start), 6)), today) }
  })
}

/**
 * Days in a row, ending today, on which every planned task was done. Today only
 * counts once it is complete (an unfinished today does not break the run), and
 * days with nothing planned are skipped.
 */
export function streak(tasks: PTask[], done: Set<string>, today: string, lookback = 366): number {
  let n = 0
  for (let i = 0; i < lookback; i++) {
    const date = iso(addDays(day(today), -i))
    const s = stats(planned(tasks, date, date), done)
    if (!s.planned) continue
    if (s.done === s.planned) n++
    else if (i === 0) continue
    else break
  }
  return n
}

/** Per-task completion in a period, weakest first — what keeps slipping. */
export function slipping(tasks: PTask[], done: Set<string>, from: string, to: string, today: string) {
  const occ = planned(tasks, from, to < today ? to : today)
  return tasks
    .map((t) => ({ taskId: t.id, ...stats(occ.filter((o) => o.taskId === t.id), done) }))
    .filter((r) => r.planned > 0 && r.done < r.planned)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || b.planned - a.planned)
}

export const daysBetween = (a: string, b: string) => differenceInCalendarDays(day(b), day(a))
