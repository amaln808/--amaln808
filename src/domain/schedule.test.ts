import { describe, expect, it } from 'vitest'
import {
  agreementStatus,
  dueToday,
  durationParts,
  endAfterMonths,
  nextOccurrence,
  occurrencesBetween,
  occursOn,
  type TaskLike,
  upcoming,
} from './schedule'

const task = (over: Partial<TaskLike>): TaskLike => ({
  id: 't',
  active: true,
  recurrence: 'once',
  intervalN: 1,
  startDate: '2026-10-01',
  ...over,
})

describe('occurrences', () => {
  it('one-off tasks fall on their date only', () => {
    const t = task({ startDate: '2026-10-24' })
    expect(occurrencesBetween(t, '2026-10-01', '2026-12-31')).toEqual(['2026-10-24'])
  })

  it('daily every 2 days', () => {
    const t = task({ recurrence: 'daily', intervalN: 2 })
    expect(occurrencesBetween(t, '2026-10-01', '2026-10-07')).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'])
  })

  it('weekly on Sunday and Wednesday (2026-10-04 is a Sunday)', () => {
    const t = task({ recurrence: 'weekly', startDate: '2026-10-04', weekdays: [0, 3] })
    expect(occurrencesBetween(t, '2026-10-01', '2026-10-14')).toEqual(['2026-10-04', '2026-10-07', '2026-10-11', '2026-10-14'])
  })

  it('every other week keeps to the start week', () => {
    const t = task({ recurrence: 'weekly', intervalN: 2, startDate: '2026-10-04' })
    expect(occurrencesBetween(t, '2026-10-01', '2026-11-01')).toEqual(['2026-10-04', '2026-10-18', '2026-11-01'])
  })

  it('monthly on the 31st falls on the last day of shorter months', () => {
    const t = task({ recurrence: 'monthly', startDate: '2026-01-31' })
    expect(occurrencesBetween(t, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('quarterly = monthly every 3', () => {
    const t = task({ recurrence: 'monthly', intervalN: 3, startDate: '2026-01-15' })
    expect(occurrencesBetween(t, '2026-01-01', '2026-12-31')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])
  })

  it('yearly, and stops after the end date', () => {
    const t = task({ recurrence: 'yearly', startDate: '2026-03-10', endDate: '2028-12-31' })
    expect(occurrencesBetween(t, '2026-01-01', '2030-12-31')).toEqual(['2026-03-10', '2027-03-10', '2028-03-10'])
    expect(nextOccurrence(t, '2028-03-11')).toBeNull()
  })

  it('nothing before the start date', () => {
    expect(occursOn(task({ recurrence: 'daily', startDate: '2026-10-10' }), '2026-10-09')).toBe(false)
  })
})

describe('dueToday', () => {
  const today = '2026-10-24' // Saturday

  it('lists today’s tasks with their done state', () => {
    const t = task({ id: 'a', recurrence: 'daily' })
    expect(dueToday([t], new Set(), today)).toEqual([{ task: t, date: today, done: false, overdue: false }])
    expect(dueToday([t], new Set([`a|${today}`]), today)[0].done).toBe(true)
  })

  it('missed daily tasks do not pile up', () => {
    const t = task({ id: 'a', recurrence: 'daily', startDate: '2026-10-01' })
    expect(dueToday([t], new Set(), today)).toHaveLength(1)
  })

  it('shows the last missed weekly occurrence as overdue', () => {
    const t = task({ id: 'w', recurrence: 'weekly', startDate: '2026-10-04' }) // Sundays
    expect(dueToday([t], new Set(), today)).toEqual([{ task: t, date: '2026-10-18', done: false, overdue: true }])
    expect(dueToday([t], new Set(['w|2026-10-18']), today)).toEqual([])
  })

  it('ignores inactive tasks', () => {
    expect(dueToday([task({ recurrence: 'daily', active: false })], new Set(), today)).toEqual([])
  })

  it('upcoming lists the next days in order', () => {
    const t = task({ id: 'w', recurrence: 'weekly', startDate: '2026-10-04' })
    expect(upcoming([t], today, 10).map((i) => i.date)).toEqual(['2026-10-25', '2026-11-01'])
  })
})

describe('agreements', () => {
  it('status from the end date and alert window', () => {
    const a = { endDate: '2026-11-20', alertDays: 30 }
    expect(agreementStatus(a, '2026-10-01')).toEqual({ status: 'active', daysLeft: 50 })
    expect(agreementStatus(a, '2026-10-24')).toEqual({ status: 'expiring', daysLeft: 27 })
    expect(agreementStatus(a, '2026-11-21')).toEqual({ status: 'expired', daysLeft: -1 })
  })

  it('duration counts the end date', () => {
    expect(durationParts('2026-01-01', '2026-12-31')).toEqual({ years: 1, months: 0, days: 0 })
    expect(durationParts('2026-01-15', '2027-04-14')).toEqual({ years: 1, months: 3, days: 0 })
    expect(durationParts('2026-10-01', '2026-10-10')).toEqual({ years: 0, months: 0, days: 10 })
  })

  it('end date after N months', () => {
    expect(endAfterMonths('2026-01-01', 12)).toBe('2026-12-31')
    expect(endAfterMonths('2026-10-24', 6)).toBe('2027-04-23')
  })
})
