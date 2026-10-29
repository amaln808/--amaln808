import { getLang, type Lang } from '../i18n/index'
import { ltr, normalizeDigits } from './money'

/** A known code (kg, g, piece, liter, ml) or any unit the owner typed, e.g. «علبة». */
export type Unit = string

const UNITS_AR: Record<string, string> = { kg: 'كجم', g: 'جم', piece: 'قطعة', liter: 'لتر', ml: 'مل' }
const UNITS_EN: Record<string, string> = { kg: 'kg', g: 'g', piece: 'pc', liter: 'L', ml: 'mL' }
/** Suggested before any unit has been typed */
export const COMMON_UNITS: Unit[] = ['kg', 'g', 'liter', 'ml', 'piece']

export function unitLabel(u: Unit, lang: Lang = getLang()): string {
  return (lang === 'en' ? UNITS_EN : UNITS_AR)[u] ?? u
}

/** Unit labels in the current language (read at render time). */
export const UNIT_LABELS: Record<string, string> = new Proxy(UNITS_AR, {
  get: (_t, k: string) => unitLabel(k),
})

// Other ways of writing the known units
const ALIASES: Record<string, Unit> = {
  كيلو: 'kg', كيلوجرام: 'kg', كيلوغرام: 'kg', كغ: 'kg', kilo: 'kg', kilogram: 'kg',
  جرام: 'g', غرام: 'g', غ: 'g', gram: 'g', gr: 'g',
  ل: 'liter', ليتر: 'liter', l: 'liter', litre: 'liter', liter: 'liter',
  ملل: 'ml', مليلتر: 'ml', ملليلتر: 'ml', ميلي: 'ml', 'مل لتر': 'ml', milliliter: 'ml', millilitre: 'ml',
  حبة: 'piece', pcs: 'piece', pieces: 'piece',
}

/** Typed unit → stored value: a known code when it is one («ملل» → ml), else the text as typed. */
export function toUnit(text: string): Unit {
  const s = text.trim().replace(/\s+/g, ' ')
  const k = s.toLowerCase()
  for (const code of Object.keys(UNITS_AR)) if (k === code || k === UNITS_AR[code] || k === UNITS_EN[code].toLowerCase()) return code
  return ALIASES[k] ?? s
}

/** The usual units first, then every other unit already used, without repeats. */
export function unitSuggestions(used: Unit[]): Unit[] {
  return [...new Set([...COMMON_UNITS, ...used.filter((u) => u.trim())])]
}

/** Quantities are kept to 3 decimals to avoid floating-point drift. */
export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000
}

export function parseQty(input: string): number | null {
  const s = normalizeDigits(input.trim())
  if (!/^\d*(\.\d{0,3})?$/.test(s) || s === '' || s === '.') return null
  return roundQty(Number(s))
}

const qtyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

export function formatQty(qty: number, unit?: Unit, lang: Lang = getLang()): string {
  const n = qty < 0 ? ltr(qtyFormatter.format(qty)) : qtyFormatter.format(qty)
  return unit ? `${n} ${unitLabel(unit, lang)}` : n
}

/** "+20 كجم" / "−2 كجم" with the sign kept beside the number in RTL text. */
export function formatSignedQty(qty: number, unit?: Unit): string {
  const n = ltr(`${qty > 0 ? '+' : qty < 0 ? '−' : ''}${qtyFormatter.format(Math.abs(qty))}`)
  return unit ? `${n} ${UNIT_LABELS[unit]}` : n
}
