import { normalizeDigits } from './money'

/** What the camera reading suggests for an expense; the owner always confirms. */
export interface ReceiptGuess {
  /** yyyy-mm-dd */
  date: string | null
  amountBaisa: number | null
}

const TOTAL_WORDS = /(grand\s*total|total|amount\s*due|net\s*amount|balance\s*due|الإجمالي|الاجمالي|إجمالي|اجمالي|المجموع|المبلغ|المستحق|الصافي|صافي)/i

/** Arabic digits and separators → plain ASCII, keeping line breaks. */
function clean(text: string): string {
  return text
    .split('\n')
    .map((l) => normalizeDigits(l.replace(/\s+/g, '\u0001')).replace(/\u0001/g, ' '))
    .join('\n')
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const back = new Date(`${iso}T00:00:00Z`)
  return back.getUTCMonth() + 1 === m && back.getUTCDate() === d ? iso : null
}

/** Dates in the text, day-first (as written in Oman) or year-first. */
export function findDates(text: string): string[] {
  const t = clean(text)
  const out: string[] = []
  for (const m of t.matchAll(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/g)) {
    const iso = validDate(+m[1], +m[2], +m[3])
    if (iso) out.push(iso)
  }
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?!\d)/g)) {
    const iso = validDate(+m[3], +m[2], +m[1])
    if (iso) out.push(iso)
  }
  return [...new Set(out)]
}

/** Money amounts in a piece of text, in baisa ("1,234.500" → 1234500). */
export function findAmounts(text: string, requireDecimals = false): number[] {
  const out: number[] = []
  for (const m of clean(text).matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,3}))?(?![\d])/g)) {
    if (requireDecimals && !m[2]) continue
    const whole = Number(m[1].replace(/,/g, ''))
    const frac = m[2] ? Number(m[2].padEnd(3, '0')) : 0
    const baisa = whole * 1000 + frac
    if (baisa > 0 && baisa < 100_000_000) out.push(baisa)
  }
  return out
}

/**
 * Best guesses from the text the camera read: the latest date that is not in the
 * future, and the largest amount on a «total» line (or the largest decimal amount).
 */
export function guessReceipt(text: string, today: string): ReceiptGuess {
  const dates = findDates(text).filter((d) => d <= today).sort()
  const lines = clean(text).split('\n')
  const onTotalLines = lines.filter((l) => TOTAL_WORDS.test(l)).flatMap((l) => findAmounts(l))
  const pool = onTotalLines.length ? onTotalLines : findAmounts(text, true)
  return {
    date: dates.length ? dates[dates.length - 1] : null,
    amountBaisa: pool.length ? Math.max(...pool) : null,
  }
}
