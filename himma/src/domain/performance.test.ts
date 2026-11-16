import { describe, expect, it } from 'vitest'
import { doneSet, periodStats, planned, slipping, streak, weekDays, weeklySeries, type PTask } from './performance'

const daily: PTask = { id: 'd', scope: 'personal', recurrence: 'daily', intervalN: 1, startDate: '2026-11-01' }
// Sunday and Tuesday
const weekly: PTask = { id: 'w', scope: 'work', recurrence: 'weekly', intervalN: 1, startDate: '2026-11-01', weekdays: [0, 2] }

describe('performance', () => {
  it('counts planned occurrences and stops at the archive date', () => {
    expect(planned([daily], '2026-11-01', '2026-11-07')).toHaveLength(7)
    expect(planned([{ ...daily, archivedOn: '2026-11-04' }], '2026-11-01', '2026-11-07')).toHaveLength(3)
    expect(planned([weekly], '2026-11-01', '2026-11-14').map((o) => o.date)).toEqual(['2026-11-01', '2026-11-03', '2026-11-08', '2026-11-10'])
  })

  it('computes the period rate up to today, split by scope', () => {
    const done = doneSet([
      { taskId: 'd', dueDate: '2026-11-15' },
      { taskId: 'd', dueDate: '2026-11-16' },
      { taskId: 'w', dueDate: '2026-11-15' },
    ])
    // week of Sun 15 Nov, today Mon 16: daily ×2, weekly Sunday ×1 (Tuesday is still ahead)
    const s = periodStats([daily, weekly], done, '2026-11-15', '2026-11-21', '2026-11-16')
    expect(s).toMatchObject({ planned: 3, done: 3, rate: 1 })
    expect(s.work).toMatchObject({ planned: 1, done: 1 })
    expect(s.personal).toMatchObject({ planned: 2, done: 2 })
    expect(periodStats([], done, '2026-11-15', '2026-11-21', '2026-11-16').rate).toBeNull()
  })

  it('builds the week strip from Sunday with future days unrated', () => {
    const days = weekDays([daily, weekly], doneSet([{ taskId: 'd', dueDate: '2026-11-15' }]), '2026-11-16')
    expect(days[0]).toMatchObject({ date: '2026-11-15', planned: 2, done: 1, rate: 0.5, future: false })
    expect(days[2]).toMatchObject({ date: '2026-11-17', planned: 2, rate: null, future: true })
    expect(days).toHaveLength(7)
  })

  it('lists weeks oldest first', () => {
    const rows = weeklySeries([daily], doneSet([]), '2026-11-16', 3)
    expect(rows.map((r) => r.start)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15'])
    expect(rows[2].planned).toBe(2)
  })

  it('counts the streak, not breaking on an unfinished today or an empty day', () => {
    const t: PTask = { ...weekly, weekdays: [0, 1, 3] } // Sun, Mon, Wed
    const done = doneSet(['2026-11-08', '2026-11-09', '2026-11-11', '2026-11-15'].map((d) => ({ taskId: 'w', dueDate: d })))
    // today Mon 16 not done yet → Sun 15, Wed 11, Mon 9, Sun 8 (Tue, Thu–Sat had nothing planned)
    expect(streak([t], done, '2026-11-16')).toBe(4)
    done.add('w|2026-11-16')
    expect(streak([t], done, '2026-11-16')).toBe(5)
    done.delete('w|2026-11-11')
    expect(streak([t], done, '2026-11-16')).toBe(2)
  })

  it('lists the tasks that slip most', () => {
    const done = doneSet([{ taskId: 'w', dueDate: '2026-11-01' }])
    const rows = slipping([daily, weekly], done, '2026-11-01', '2026-11-07', '2026-11-07')
    expect(rows.map((r) => [r.taskId, r.done, r.planned])).toEqual([['d', 0, 7], ['w', 1, 2]])
  })
})
