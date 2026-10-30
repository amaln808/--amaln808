import { useEffect, useState } from 'react'
import { NumberInput } from '../../components/form'
import { baseToSmall, formatQty, parseQty, smallToBase, smallUnitOf, type Unit, unitLabel } from '../../domain/quantity'
import { t } from '../../i18n/index'

/**
 * Quantity in the material's unit, or — for kg and litres — typed in grams /
 * millilitres: the unit button switches, and the value is always handed back
 * in the stored unit (175 جم → «0.175»). The other unit shows underneath.
 */
export function QtyInput({
  value,
  onChange,
  unit,
  decimals = 3,
  preferSmall = false,
}: {
  /** Text in the stored unit */
  value: string
  onChange: (baseText: string) => void
  unit: Unit | undefined
  /** Decimals kept in the stored unit (recipes 6, batch totals 3) */
  decimals?: number
  /** Start in grams / millilitres (recipes: per-jar amounts are small) */
  preferSmall?: boolean
}) {
  const small = smallUnitOf(unit)
  const startSmall = !!small && preferSmall && (!value || (parseQty(value, decimals) ?? 0) < 1)
  const [inSmall, setInSmall] = useState(startSmall)
  const [text, setText] = useState(() => (startSmall ? baseToSmall(value, decimals) : value))
  const smallMode = !!small && inSmall

  // A value set from outside (e.g. the recipe fills the batch) replaces what is shown
  useEffect(() => {
    const shown = smallMode ? smallToBase(text, decimals) : text
    if ((parseQty(shown, decimals) ?? shown) !== (parseQty(value, decimals) ?? value)) setText(smallMode ? baseToSmall(value, decimals) : value)
  }, [value])

  const type = (v: string) => {
    setText(v)
    onChange(smallMode ? smallToBase(v, decimals) : v)
  }
  const toggle = () => {
    setText(inSmall ? value : baseToSmall(value, decimals))
    setInSmall(!inSmall)
  }

  if (!small) return <NumberInput value={value} onChange={(e) => onChange(e.target.value)} suffix={unit ? unitLabel(unit) : undefined} />
  const base = parseQty(value, decimals)
  return (
    <div>
      <div className="relative">
        <NumberInput value={text} onChange={(e) => type(e.target.value)} className="!pe-16" />
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-y-1 end-1 min-w-11 rounded-lg bg-brand-50 px-2 text-sm font-medium text-brand-800"
          aria-label={t('تبديل الوحدة', 'Switch unit')}
        >
          {unitLabel(smallMode ? small : unit!)}
        </button>
      </div>
      {base != null && base > 0 && (
        <div className="mt-1 text-xs text-muted">= {smallMode ? formatQty(base, unit) : formatQty(Number(baseToSmall(value, decimals)), small)}</div>
      )}
    </div>
  )
}
