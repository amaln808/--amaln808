import { normalizeDigits } from './money'

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
  const n = qtyFormatter.format(qty)
  return unit ? `${n} ${UNIT_LABELS[unit]}` : n
}
