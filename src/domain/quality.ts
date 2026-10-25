import { normalizeDigits } from './money'

/**
 * A lab value is over the owner's limit when both are known and the value is
 * strictly above it (at the limit is still acceptable).
 */
export function overLimit(value: string | number | null | undefined, limit: string | number | null | undefined): boolean {
  const v = toNumber(value)
  const l = toNumber(limit)
  return v != null && l != null && v > l
}

function toNumber(x: string | number | null | undefined): number | null {
  if (x == null || x === '') return null
  const n = Number(normalizeDigits(String(x)))
  return Number.isFinite(n) ? n : null
}
