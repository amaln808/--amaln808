import type { TaskRule } from './schedule'

/**
 * iCalendar (.ics) files so tasks and agreement expiries can be added to the
 * iPad Calendar, which then gives real notifications even when the app is closed.
 */

export interface IcsEvent {
  uid: string
  title: string
  description?: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM; all-day when missing */
  time?: string | null
  rule?: TaskRule
  /** Minutes before the start (negative = after, e.g. -480 = 8:00 on an all-day event) */
  alarms?: number[]
}

const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

/** Lines longer than 75 bytes are folded (RFC 5545), splitting only between characters. */
export function fold(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
    }
    cur += ch
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

export function rrule(rule: TaskRule): string | null {
  if (rule.recurrence === 'once') return null
  const parts = [`FREQ=${rule.recurrence.toUpperCase()}`]
  if (rule.intervalN > 1) parts.push(`INTERVAL=${rule.intervalN}`)
  if (rule.recurrence === 'weekly' && rule.weekdays?.length) parts.push(`BYDAY=${rule.weekdays.map((d) => WEEKDAY[d]).join(',')}`)
  if (rule.recurrence === 'monthly' && Number(rule.startDate.slice(8)) === 31) parts.push('BYMONTHDAY=-1')
  if (rule.endDate) parts.push(`UNTIL=${rule.endDate.replace(/-/g, '')}`)
  return parts.join(';')
}

function trigger(minutes: number): string {
  const sign = minutes >= 0 ? '-' : ''
  const m = Math.abs(minutes)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  return `${sign}P${d ? `${d}D` : ''}T${h}H${min}M`
}

export function buildIcs(events: IcsEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zuwardah//Factory//AR', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const d = e.date.replace(/-/g, '')
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@zawrda`, `DTSTAMP:${stamp}`)
    if (e.time) {
      const t = e.time.replace(':', '').slice(0, 4)
      lines.push(`DTSTART:${d}T${t}00`, 'DURATION:PT30M')
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`, 'DURATION:P1D')
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    const r = e.rule && rrule(e.rule)
    if (r) lines.push(`RRULE:${r}`)
    for (const a of e.alarms ?? []) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:${trigger(a)}`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Opens the file so iOS offers "Add to Calendar". */
export function openIcs(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
