/**
 * Omani Rial helpers. Amounts are stored as integer baisa (1 OMR = 1000 baisa)
 * and only converted to rials for display or input.
 */

export const BAISA_PER_RIAL = 1000

const rialFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

/** 1234500 → "1,234.500" */
export function formatBaisa(baisa: number): string {
  return rialFormatter.format(baisa / BAISA_PER_RIAL)
}

/** 1234500 → "1,234.500 ر.ع" */
export function formatOMR(baisa: number): string {
  return `${formatBaisa(baisa)} ر.ع`
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Converts Arabic-Indic / Persian digits and separators to plain ASCII. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
}

/**
 * Parses a user-typed rial amount into baisa. Accepts Arabic digits.
 * Returns null for empty or invalid input, or more than 3 decimals.
 */
export function parseRialToBaisa(input: string): number | null {
  const s = normalizeDigits(input.trim())
  if (s === '') return null
  const m = /^(-)?(\d*)(?:\.(\d{0,3}))?$/.exec(s)
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return null
  const sign = m[1] ? -1 : 1
  const whole = Number(m[2] || '0')
  const frac = Number((m[3] ?? '').padEnd(3, '0'))
  return sign * (whole * BAISA_PER_RIAL + frac)
}

/** Rounds a possibly fractional baisa value (e.g. from qty × price) to an integer. */
export function roundBaisa(baisa: number): number {
  return Math.round(baisa)
}

/** qty × unit price, rounded to whole baisa. */
export function lineTotal(qty: number, unitBaisa: number): number {
  return roundBaisa(qty * unitBaisa)
}
