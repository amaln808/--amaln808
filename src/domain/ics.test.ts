import { describe, expect, it } from 'vitest'
import { buildIcs, escapeText, fold, rrule } from './ics'

describe('ics', () => {
  it('maps repeat rules', () => {
    expect(rrule({ recurrence: 'once', intervalN: 1, startDate: '2026-10-24' })).toBeNull()
    expect(rrule({ recurrence: 'daily', intervalN: 2, startDate: '2026-10-24' })).toBe('FREQ=DAILY;INTERVAL=2')
    expect(rrule({ recurrence: 'weekly', intervalN: 1, startDate: '2026-10-25', weekdays: [0, 3] })).toBe('FREQ=WEEKLY;BYDAY=SU,WE')
    expect(rrule({ recurrence: 'monthly', intervalN: 3, startDate: '2026-01-31', endDate: '2027-12-31' })).toBe(
      'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1;UNTIL=20271231',
    )
    expect(rrule({ recurrence: 'yearly', intervalN: 1, startDate: '2026-03-10' })).toBe('FREQ=YEARLY')
  })

  it('escapes text and folds long Arabic lines without breaking characters', () => {
    expect(escapeText('a,b;c\nd')).toBe('a\\,b\\;c\\nd')
    const long = 'SUMMARY:' + 'تجديد تصريح البيع '.repeat(8)
    const folded = fold(long)
    for (const part of folded.split('\r\n ')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n ').join('')).toBe(long)
  })

  it('builds an all-day event with alarms', () => {
    const text = buildIcs(
      [{ uid: 'x', title: 'انتهاء العقد', date: '2026-12-31', alarms: [30 * 1440 - 480, -480] }],
      new Date('2026-10-24T08:00:00Z'),
    )
    expect(text).toContain('DTSTART;VALUE=DATE:20261231\r\n')
    expect(text).toContain('TRIGGER:-P29DT16H0M\r\n')
    expect(text).toContain('TRIGGER:PT8H0M\r\n')
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })

  it('timed events start at the given time', () => {
    const text = buildIcs([{ uid: 'y', title: 'تنظيف', date: '2026-10-25', time: '07:30:00', alarms: [0] }])
    expect(text).toContain('DTSTART:20261025T073000\r\n')
    expect(text).toContain('TRIGGER:-PT0H0M\r\n')
  })
})
