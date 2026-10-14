import { ltr, normalizeDigits } from './money'

export type Unit = 'kg' | 'g' | 'piece' | 'liter'

export const UNIT_LABELS: Record<Unit, string> = {
  kg: 'كجم',
  g: 'جم',
  piece: 'قطعة',
  liter: 'لتر',
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

export function formatQty(qty: number, unit?: Unit): string {
  const n = qty < 0 ? ltr(qtyFormatter.format(qty)) : qtyFormatter.format(qty)
  return unit ? `${n} ${UNIT_LABELS[unit]}` : n
}

/** "+20 كجم" / "−2 كجم" with the sign kept beside the number in RTL text. */
export function formatSignedQty(qty: number, unit?: Unit): string {
  const n = ltr(`${qty > 0 ? '+' : qty < 0 ? '−' : ''}${qtyFormatter.format(Math.abs(qty))}`)
  return unit ? `${n} ${UNIT_LABELS[unit]}` : n
}
