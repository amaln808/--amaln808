import { getLang, type Lang } from '../i18n/index'
import { ltr, normalizeDigits } from './money'

export type Unit = 'kg' | 'g' | 'piece' | 'liter'

const UNITS_AR: Record<Unit, string> = { kg: 'كجم', g: 'جم', piece: 'قطعة', liter: 'لتر' }
const UNITS_EN: Record<Unit, string> = { kg: 'kg', g: 'g', piece: 'pc', liter: 'L' }

export function unitLabel(u: Unit, lang: Lang = getLang()): string {
  return (lang === 'en' ? UNITS_EN : UNITS_AR)[u]
}

/** Unit labels in the current language (read at render time). */
export const UNIT_LABELS: Record<Unit, string> = new Proxy(UNITS_AR, {
  get: (_t, k: string) => unitLabel(k as Unit),
})

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
