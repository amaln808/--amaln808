import { NumberInput } from '../../components/form'
import { baseToSmall, formatQty, parseQty, smallUnitOf, type Unit, unitLabel } from '../../domain/quantity'

/**
 * Quantity in the material's own unit only (kg, litre, piece…) — the owner's
 * choice, to avoid mixing grams and kilograms. For kg and litres the same
 * amount shows underneath in grams / millilitres, read-only, to check it.
 */
export function QtyInput({
  value,
  onChange,
  unit,
  decimals = 3,
}: {
  value: string
  onChange: (text: string) => void
  unit: Unit | undefined
  /** Decimals kept (recipes 6, batch totals 3) */
  decimals?: number
}) {
  const small = smallUnitOf(unit)
  const q = parseQty(value, decimals)
  return (
    <div>
      <NumberInput value={value} onChange={(e) => onChange(e.target.value)} suffix={unit ? unitLabel(unit) : undefined} />
      {small && q != null && q > 0 && <div className="mt-1 text-xs text-muted">= {formatQty(Number(baseToSmall(value, decimals)), small)}</div>}
    </div>
  )
}
