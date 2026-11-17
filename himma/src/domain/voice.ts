import { addDays, addMonths, addYears, endOfMonth, getDaysInMonth } from 'date-fns'
import type { Recurrence } from '../../../src/domain/schedule'
import { day, iso } from '../../../src/domain/schedule'
import type { Scope } from './performance'

/**
 * Understands a spoken (or typed) Arabic sentence as a task:
 *   «متابعة صيدلية الشفاء كل أحد الساعة 9 صباحاً، مهمة»
 *   → title «متابعة صيدلية الشفاء», weekly on Sunday, 09:00, important.
 * Everything recognised is cut out of the sentence; what is left is the title.
 */

export interface ParsedTask {
  title: string
  scope: Scope | null
  important: boolean
  recurrence: Recurrence
  intervalN: number
  weekdays: number[]
  startDate: string
  dueTime: string | null
  /** what was understood, in words, for the review chips */
  heard: string[]
}

// ── Normalising ─────────────────────────────────────────────────────
// Tashkeel and tatweel are dropped from the sentence itself (dictation rarely adds them);
// the rest is mapped one character to one character, so positions found in the
// normalised text are the same in the original.
const stripMarks = (s: string) => s.replace(/[ً-ْٰـ]/g, '')
function norm(s: string): string {
  return s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/،/g, ',')
    .replace(/٫/g, '.')
    .toLowerCase()
}

// Word edges: Arabic letters are not \w, so boundaries are spelt out
const S = '(?<=^|[\\s,.!?؟:;،\\-])'
const E = '(?=$|[\\s,.!?؟:;،\\-])'

// ── Numbers ─────────────────────────────────────────────────────────
const NUM_WORDS: [string, number][] = [
  ['احدي عشره', 11], ['احدي عشر', 11], ['احد عشر', 11], ['الحاديه عشره', 11], ['الحاديه عشر', 11],
  ['اثنا عشر', 12], ['اثني عشر', 12], ['اثنعش', 12], ['الثانيه عشره', 12], ['الثانيه عشر', 12],
  ['واحده', 1], ['واحد', 1], ['الواحده', 1],
  ['اثنين', 2], ['اثنان', 2], ['ثنتين', 2], ['الثانيه', 2],
  ['ثلاثه', 3], ['ثلاث', 3], ['الثالثه', 3],
  ['اربعه', 4], ['اربع', 4], ['الرابعه', 4],
  ['خمسه', 5], ['خمس', 5], ['الخامسه', 5],
  ['سته', 6], ['ست', 6], ['السادسه', 6],
  ['سبعه', 7], ['سبع', 7], ['السابعه', 7],
  ['ثمانيه', 8], ['ثماني', 8], ['ثمان', 8], ['الثامنه', 8],
  ['تسعه', 9], ['تسع', 9], ['التاسعه', 9],
  ['عشره', 10], ['عشر', 10], ['العاشره', 10],
]
const NUM = `(\\d{1,2}|${NUM_WORDS.map(([w]) => w).join('|')})`
function num(s: string): number {
  if (/^\d+$/.test(s)) return Number(s)
  return NUM_WORDS.find(([w]) => w === s)?.[1] ?? NaN
}

// ── Days and months ─────────────────────────────────────────────────
const WD_STEMS: [string, number][] = [
  ['احد', 0], ['اثنين', 1], ['ثلاثا', 2], ['اربعا', 3], ['خميس', 4], ['جمعه', 5], ['سبت', 6],
]
const WD = `(?:ال)?(احد|اثنين|ثلاثا|اربعا|خميس|جمعه|سبت)ء?`
const wd = (stem: string) => WD_STEMS.find(([w]) => w === stem)![1]
const WD_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر']
const MONTH = `(${MONTHS.join('|')})`

const PERIOD = '(صباحا|صباح|الصبح|الصباح|صبحا|فجرا|الفجر|ص|ظهرا|الظهر|عصرا|العصر|مساءا|مساء|المساء|المسا|مسا|م|ليلا|الليل|بالليل|في الليل|في المساء|في الصباح)'

/** 24-hour time from a spoken hour, minutes and part of the day. */
function to24(h: number, m: number, period?: string): string | null {
  if (!(h >= 0 && h <= 24) || !(m >= 0 && m < 60)) return null
  const p = period ?? ''
  if (/صب|فجر|^ص$/.test(p)) {
    if (h === 12) h = 0
  } else if (/ظهر/.test(p)) {
    if (h >= 1 && h <= 4) h += 12
  } else if (/عصر|مسا|ليل|^م$/.test(p)) {
    if (h < 12) h += 12
  } else if (!p && h >= 1 && h <= 6) {
    // "at 3" in a working day means the afternoon
    h += 12
  }
  if (h === 24) h = 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Next date (today included) that falls on the weekday. */
function nextWeekday(today: string, d: number, strictlyAfter = false): string {
  const t = day(today)
  let diff = (d - t.getDay() + 7) % 7
  if (diff === 0 && strictlyAfter) diff = 7
  return iso(addDays(t, diff))
}

/** Next date (today included) on this day of the month. */
function nextMonthDay(today: string, dom: number): string {
  const t = day(today)
  const thisMonth = new Date(t.getFullYear(), t.getMonth(), Math.min(dom, getDaysInMonth(t)))
  if (iso(thisMonth) >= today) return iso(thisMonth)
  const n = addMonths(new Date(t.getFullYear(), t.getMonth(), 1), 1)
  return iso(new Date(n.getFullYear(), n.getMonth(), Math.min(dom, getDaysInMonth(n))))
}

/** A day and month: this year, or next year once it has passed. */
function dayMonth(today: string, d: number, m: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const y = day(today).getFullYear()
  let date = new Date(y, m - 1, Math.min(d, getDaysInMonth(new Date(y, m - 1, 1))))
  if (iso(date) < today) date = addYears(date, 1)
  return iso(date)
}

export function parseTask(sentence: string, today: string): ParsedTask {
  const original = stripMarks(sentence).replace(/\s+/g, ' ').trim()
  const text = norm(original)
  const taken = new Array(text.length).fill(false)
  const heard: string[] = []

  /** First match of the pattern in a part of the sentence not used yet; marks it used. */
  function take(pattern: string): RegExpExecArray | null {
    const re = new RegExp(`${S}${pattern}${E}`, 'g')
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const from = m.index
      const to = from + m[0].length
      if (taken.slice(from, to).some(Boolean)) continue
      for (let i = from; i < to; i++) taken[i] = true
      return m
    }
    return null
  }

  let recurrence: Recurrence = 'once'
  let intervalN = 1
  let weekdays: number[] = []
  let startDate: string | null = null
  let dueTime: string | null = null
  let scope: Scope | null = null
  let important = false
  let m: RegExpExecArray | null

  // ── Repeating ──
  const EVERY = '(?:و\\s*)?(?:كل|كـل)'
  if ((m = take(`(?:في\\s+)?(?:يوم\\s+)?(\\d{1,2})\\s+(?:من\\s+)?${EVERY}\\s+شهر`))) {
    recurrence = 'monthly'
    startDate = nextMonthDay(today, Number(m[1]))
    heard.push(`شهرياً يوم ${Number(m[1])}`)
  } else if ((m = take(`${EVERY}\\s+(?:يوم\\s+)?${WD}((?:\\s*(?:,|و)\\s*(?:يوم\\s+)?${WD})*)`))) {
    recurrence = 'weekly'
    const all = [...m[0].matchAll(new RegExp(WD, 'g'))].map((x) => wd(x[1]))
    weekdays = [...new Set(all)].sort()
    heard.push(`أسبوعياً: ${weekdays.map((d) => WD_NAMES[d]).join('، ')}`)
  } else if ((m = take(`${EVERY}\\s+${NUM}\\s+(?:ايام|يوم)`))) {
    recurrence = 'daily'
    intervalN = num(m[1])
  } else if (take(`${EVERY}\\s+يومين`)) {
    recurrence = 'daily'
    intervalN = 2
  } else if (take(`(?:${EVERY}\\s+(?:يوم|ليله|صباح|مساء)|يوميا|يومي)`)) {
    recurrence = 'daily'
  } else if ((m = take(`${EVERY}\\s+${NUM}\\s+(?:اسابيع|اسبوع)`))) {
    recurrence = 'weekly'
    intervalN = num(m[1])
  } else if (take(`${EVERY}\\s+اسبوعين`)) {
    recurrence = 'weekly'
    intervalN = 2
  } else if (take(`(?:${EVERY}\\s+(?:اسبوع|جمعه\\s+وجمعه)|اسبوعيا|اسبوعي)`)) {
    recurrence = 'weekly'
  } else if ((m = take(`${EVERY}\\s+${NUM}\\s+(?:اشهر|شهور|شهر)`))) {
    recurrence = 'monthly'
    intervalN = num(m[1])
  } else if (take(`${EVERY}\\s+شهرين`)) {
    recurrence = 'monthly'
    intervalN = 2
  } else if (take(`(?:${EVERY}\\s+شهر|شهريا|شهري)`)) {
    recurrence = 'monthly'
  } else if (take(`${EVERY}\\s+(?:سنتين|عامين)`)) {
    recurrence = 'yearly'
    intervalN = 2
  } else if (take(`(?:${EVERY}\\s+(?:سنه|عام)|سنويا|سنوي)`)) {
    recurrence = 'yearly'
  }
  if (recurrence !== 'once' && !heard.length) {
    const unit = { daily: ['يومياً', 'أيام'], weekly: ['أسبوعياً', 'أسابيع'], monthly: ['شهرياً', 'أشهر'], yearly: ['سنوياً', 'سنوات'] }[recurrence]
    heard.push(intervalN > 1 ? `كل ${intervalN} ${unit[1]}` : unit[0])
  }

  // ── Day ──
  const t = day(today)
  if (take('(?:بعد\\s+(?:غد|بكره|بكرا|باكر|الغد)|بعد\\s+بكره)')) {
    startDate = iso(addDays(t, 2))
  } else if ((m = take(`بعد\\s+${NUM}\\s+(?:ايام|يوم)`))) {
    startDate = iso(addDays(t, num(m[1])))
  } else if (take('بعد\\s+يومين')) {
    startDate = iso(addDays(t, 2))
  } else if ((m = take('بعد\\s+(?:اسبوع|اسبوعين)'))) {
    startDate = iso(addDays(t, m[0].includes('اسبوعين') ? 14 : 7))
  } else if (take('بعد\\s+شهر')) {
    startDate = iso(addMonths(t, 1))
  } else if (take('(?:غدا|غدوه|غد|الغد|بكره|بكرا|باكر|باچر)')) {
    startDate = iso(addDays(t, 1))
  } else if (take('(?:اليوم|الليله|هذا\\s+اليوم)')) {
    startDate = today
  } else if (take('(?:(?:في\\s+)?(?:اخر|نهايه)\\s+(?:هذا\\s+)?الشهر)')) {
    startDate = iso(endOfMonth(t))
  } else if (take('(?:(?:في\\s+)?(?:بدايه\\s+)?الاسبوع\\s+(?:القادم|الجاي|الياي|المقبل))')) {
    startDate = nextWeekday(today, 0, true)
  } else if ((m = take(`(?:(?:في|يوم)\\s+)?(\\d{1,2})\\s+(?:من\\s+)?${MONTH}`))) {
    startDate = dayMonth(today, Number(m[1]), MONTHS.indexOf(m[2]) + 1)
  } else if ((m = take('(?:(?:في|يوم)\\s+)?(\\d{1,2})\\s*/\\s*(\\d{1,2})'))) {
    startDate = dayMonth(today, Number(m[1]), Number(m[2]))
  } else if ((m = take(`(?:(?:في|يوم)\\s+)?${WD}(?:\\s+(القادم|الجاي|الياي|المقبل))?`))) {
    const d = wd(m[1])
    if (recurrence === 'weekly') {
      if (!weekdays.includes(d)) weekdays = [...weekdays, d].sort()
      heard[0] = `${intervalN > 1 ? `كل ${intervalN} أسابيع` : 'أسبوعياً'}: ${weekdays.map((x) => WD_NAMES[x]).join('، ')}`
    } else startDate = nextWeekday(today, d, Boolean(m[2]))
  }
  if (startDate && recurrence === 'once') heard.push(dayWords(startDate, today))
  else if (startDate && recurrence !== 'monthly') heard.push(`يبدأ ${dayWords(startDate, today)}`)

  // ── Time ──
  const HOUR = `(?:(?:على|في)\\s+)?(?:الساعه|ساعه|الساعة)\\s*`
  if (
    (m = take(`${HOUR}${NUM}(?::(\\d{2}))?(?:\\s*(?:و\\s*)?(نص|النص|نصف|ربع|الربع|ثلث|الثلث))?(?:\\s*(?:الا|غير)\\s*(ربع|الربع|ثلث))?(?:\\s*${PERIOD})?`)) ||
    (m = take(`(?:(?:على|في)\\s+)?(\\d{1,2}):(\\d{2})()()(?:\\s*${PERIOD})?`)) ||
    (m = take(`(?:(?:على|في)\\s+)?(\\d{1,2})()(?:\\s*(?:و\\s*)?(نص|النص|نصف|ربع|الربع))?()\\s*${PERIOD}`))
  ) {
    let h = num(m[1])
    let min = m[2] ? Number(m[2]) : 0
    const plus = m[3] ?? ''
    if (/نص/.test(plus)) min = 30
    else if (/ربع/.test(plus)) min = 15
    else if (/ثلث/.test(plus)) min = 20
    if (m[4]) {
      h -= 1
      min = 60 - (/ثلث/.test(m[4]) ? 20 : 15)
    }
    dueTime = to24(h, min, m[5])
    if (dueTime) heard.push(`الساعة ${dueTime}`)
  }
  // a part of the day said without an hour ("tomorrow morning") is not part of the title
  take('(?:صباحا|صبحا|الصبح|فجرا|ظهرا|عصرا|مساءا|مساء|ليلا|بالليل|في الصباح|في المساء|في الليل|في الظهر|في العصر)')

  // ── Commands at the start ──
  take('^(?:لو\\s+سمحت\\s+)?(?:اضف|اضيف|اضيفي|ضيف|ضيفي|سجل|سجلي|اكتب|اكتبي|انشئ|حط|حطي|ذكرني|ذكريني|تذكير|نبهني|نبهيني)(?:\\s+(?:لي|لى))?(?:\\s+(?:مهمه|بمهمه))?(?:\\s*[:,])?(?:\\s+(?:ان|بان))?')
  take('^مهمه(?:\\s*[:,])')

  // ── Work / personal, and importance ──
  if (take('(?:(?:و|,)\\s*)?(?:(?:مهمه|نوعها|النوع|تصنيف)\\s+)?(?:لل|في\\s+ال|ب|ال)?(?:شخصيه|شخصي)')) scope = 'personal'
  else if (take('(?:(?:و|,)\\s*)?(?:(?:مهمه|نوعها|النوع)\\s+)?(?:لل|في\\s+ال)?(?:عمل|شغل)(?=\\s*(?:[,.]|$))') || take('(?:مهمه|نوعها|النوع)\\s+(?:لل|في\\s+ال)?(?:عمل|شغل)')) scope = 'work'
  if (
    take('(?:(?:و|,)\\s*)?(?:مهم\\s+جدا|مهمه\\s+جدا|ضروري\\s+جدا|مهم|ضروري|عاجل|عاجله|اولويه|مستعجل|مستعجله)') ||
    take('(?<=,\\s*)مهمه\\s*\\.?$') ||
    take('(?:مهمه)\\s+(?=مهمه)')
  ) {
    important = true
  }
  if (scope) heard.push(scope === 'work' ? 'عمل' : 'شخصي')
  if (important) heard.push('مهمة ★')

  // ── Title: whatever was not understood as something else ──
  let title = ''
  for (let i = 0; i < original.length; i++) title += taken[i] ? ' ' : original[i]
  title = cleanTitle(title)

  return {
    title,
    scope,
    important,
    recurrence,
    intervalN: Math.max(1, Math.min(99, intervalN || 1)),
    weekdays,
    startDate: startDate ?? today,
    dueTime,
    heard,
  }
}

const EDGE_WORDS = ['و', 'في', 'يوم', 'على', 'الساعة', 'الساعه', 'من', 'الى', 'إلى', 'ب', 'ان', 'أن', 'لي', 'مهمة', 'مهمه', 'كل']
function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,،.])/g, '$1').trim()
  for (let i = 0; i < 10; i++) {
    const before = t
    t = t.replace(/^[\s,،.:;\-–]+|[\s,،.:;\-–]+$/g, '')
    for (const w of EDGE_WORDS) {
      if (t.startsWith(`${w} `)) t = t.slice(w.length + 1)
      if (t.endsWith(` ${w}`)) t = t.slice(0, -w.length - 1)
    }
    // "ذكريني بالاتصال" → "الاتصال"
    t = t.replace(/^ب(?=ال)/, '')
    if (t === before) break
  }
  return t.replace(/(\s*[,،]\s*){2,}/g, '، ')
}

function dayWords(date: string, today: string): string {
  const diff = Math.round((day(date).getTime() - day(today).getTime()) / 86_400_000)
  if (diff === 0) return 'اليوم'
  if (diff === 1) return 'غداً'
  if (diff === 2) return 'بعد غد'
  const f = new Intl.DateTimeFormat('ar-OM-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' })
  return f.format(day(date))
}
