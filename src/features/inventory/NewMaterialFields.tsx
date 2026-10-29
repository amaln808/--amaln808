import { Segmented } from '../../components/form'
import type { Unit } from '../../domain/quantity'
import { t } from '../../i18n/index'
import { UnitInput } from './UnitInput'

export type MaterialType = 'raw' | 'packaging'

/** Shown under a typed material name that isn't in inventory yet: it is created on save with this type and unit. */
export function NewMaterialFields({
  type,
  unit,
  onChange,
  className = '',
}: {
  type: MaterialType
  unit: Unit
  onChange: (patch: { type: MaterialType; unit: Unit }) => void
  className?: string
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 rounded-xl bg-brand-50 p-3 ${className}`}>
      <p className="col-span-2 text-sm text-brand-800">
        {t('مادة جديدة، ستُضاف إلى المخزون عند الحفظ:', 'New material, added to inventory on save:')}
      </p>
      <Segmented<MaterialType>
        value={type}
        onChange={(v) => onChange({ type: v, unit: v === 'raw' ? 'kg' : 'piece' })}
        options={[
          { value: 'raw', label: t('مادة خام', 'Raw material') },
          { value: 'packaging', label: t('تغليف', 'Packaging') },
        ]}
      />
      <UnitInput value={unit} onChange={(u) => onChange({ type, unit: u })} />
    </div>
  )
}
