import { today } from '../db/records'
import { type DateRange, type PeriodKey, periodRange } from '../domain/periods'
import { DateInput } from './form'

const OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'thisMonth', label: 'هذا الشهر' },
  { key: 'lastMonth', label: 'الشهر الماضي' },
  { key: 'last3Months', label: 'آخر 3 أشهر' },
  { key: 'thisYear', label: 'هذه السنة' },
  { key: 'all', label: 'الكل' },
  { key: 'custom', label: 'فترة مخصصة' },
]

export interface PeriodValue {
  key: PeriodKey
  custom: DateRange
}

export function initialPeriod(key: PeriodKey = 'thisMonth'): PeriodValue {
  return { key, custom: periodRange('thisMonth', today()) }
}

export function resolvePeriod(p: PeriodValue): DateRange {
  return p.key === 'custom' ? p.custom : periodRange(p.key, today())
}

/** Period chips with optional custom from/to dates. */
export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange({ ...value, key: o.key })}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition ${
              value.key === o.key ? 'border-brand-700 bg-brand-700 font-bold text-white' : 'border-stone-300 bg-white text-stone-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            من
            <DateInput value={value.custom.from} onChange={(e) => onChange({ ...value, custom: { ...value.custom, from: e.target.value } })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            إلى
            <DateInput value={value.custom.to} onChange={(e) => onChange({ ...value, custom: { ...value.custom, to: e.target.value } })} />
          </label>
        </div>
      )}
    </div>
  )
}
