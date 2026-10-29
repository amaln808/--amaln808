import { useEffect, useState } from 'react'
import { Combobox } from '../../components/form'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { toUnit, type Unit, unitLabel, unitSuggestions } from '../../domain/quantity'
import { t } from '../../i18n/index'

/**
 * Unit typed freely or picked: the usual units (كجم، جم، لتر، مل، قطعة) and every
 * unit used before. Known units are stored as codes («مليلتر» → ml).
 */
export function UnitInput({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const [text, setText] = useState(() => unitLabel(value))
  // A new value from outside (e.g. the type switched raw → packaging)
  useEffect(() => {
    if (toUnit(text) !== value) setText(unitLabel(value))
  }, [value])
  const options = unitSuggestions((items.data ?? []).map((i) => i.unit)).map((u) => ({ label: unitLabel(u) }))
  return (
    <Combobox
      value={text}
      onChange={(v) => {
        setText(v)
        onChange(toUnit(v))
      }}
      options={options}
      placeholder={t('الوحدة', 'Unit')}
      newLabel={t('جديدة', 'New')}
    />
  )
}
