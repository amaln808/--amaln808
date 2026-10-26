import { t } from '../i18n/index'
import { todayIso as today } from '../data/schedule'
import { type DateRange, type PeriodKey, periodRange } from '../domain/periods'
import { DateInput } from './form'

const options = (): Array<{ key: PeriodKey; label: string }> => [
  { key: 'thisMonth', label: t("هذا الشهر", "This month") },
  { key: 'lastMonth', label: t("الشهر الماضي", "Last month") },
  { key: 'last3Months', label: t("آخر 3 أشهر", "Last 3 months") },
  { key: 'thisYear', label: t("هذه السنة", "This year") },
  { key: 'all', label: t("الكل", "All") },
  { key: 'custom', label: t("فترة مخصصة", "Custom range") },
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
        {options().map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange({ ...value, key: o.key })}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition ${
              value.key === o.key ? 'border-brand-700 bg-brand-700 font-bold text-on-brand' : 'border-line bg-card text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {t("من", "From")}
            <DateInput value={value.custom.from} onChange={(e) => onChange({ ...value, custom: { ...value.custom, from: e.target.value } })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("إلى", "To")}
            <DateInput value={value.custom.to} onChange={(e) => onChange({ ...value, custom: { ...value.custom, to: e.target.value } })} />
          </label>
        </div>
      )}
    </div>
  )
}
