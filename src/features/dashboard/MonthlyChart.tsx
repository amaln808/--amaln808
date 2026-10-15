import { isRTL, t } from '../../i18n/index'
import { Table2 } from 'lucide-react'
import { useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../components/ui'
import { formatOMR } from '../../domain/money'
import { monthLabel } from '../../domain/periods'
import { CHROME, tickRial } from './chartTheme'

export interface SeriesDef<T> {
  key: keyof T & string
  label: string
  color: string
  kind: 'bar' | 'line'
}

/**
 * Monthly bars + one line on a single rial axis, newest month on the left
 * (time reads right-to-left). Includes legend, hover tooltip and a table view.
 */
export function MonthlyChart<T extends { month: string }>({
  title,
  rows,
  series,
}: {
  title: string
  rows: T[]
  series: SeriesDef<T>[]
}) {
  const [asTable, setAsTable] = useState(false)
  const data = rows.map((r) => ({ ...r, label: monthLabel(r.month) }))

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-stone-600 hover:bg-stone-100"
        >
          <Table2 className="size-4" /> {asTable ? t("عرض كرسم", "Show chart") : t("عرض كجدول", "Show table")}
        </button>
      </div>
      {/* Legend: always present for ≥ 2 series */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            {s.kind === 'bar' ? (
              <span className="size-3 rounded-sm" style={{ background: s.color }} />
            ) : (
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            )}
            {s.label}
          </span>
        ))}
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="py-2 pe-4 text-start font-medium">{t("الشهر", "Month")}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 pe-4 text-start font-medium">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((r) => (
                <tr key={r.month} className="border-b border-stone-100 last:border-0">
                  <td className="py-2 pe-4">{r.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-2 pe-4"><span className="num">{formatOMR(r[s.key] as number)}</span></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data as Array<Record<string, unknown>>} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke={CHROME.grid} />
              <XAxis dataKey="label" reversed={isRTL()} tick={{ fill: CHROME.text, fontSize: 12 }} axisLine={{ stroke: CHROME.axis }} tickLine={false} />
              <YAxis orientation={isRTL() ? 'right' : 'left'} tickFormatter={tickRial} tick={{ fill: CHROME.text, fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip
                cursor={{ fill: 'rgba(120,113,108,0.08)' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div dir={isRTL() ? 'rtl' : 'ltr'} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm shadow-lg">
                      <div className="mb-1 font-bold">{label}</div>
                      {series.map((s) => {
                        const v = payload.find((p) => p.dataKey === s.key)?.value as number | undefined
                        return (
                          <div key={s.key} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-stone-600">
                              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                              {s.label}
                            </span>
                            <span className="num font-bold">{formatOMR(v ?? 0)}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : null
                }
              />
              {/* Bars are drawn left-to-right, so reverse them to put the first series on the right (RTL), lines last */}
              {[...(isRTL() ? series.filter((s) => s.kind === 'bar').reverse() : series.filter((s) => s.kind === 'bar')), ...series.filter((s) => s.kind === 'line')].map((s) =>
                s.kind === 'bar' ? (
                  <Bar key={s.key} dataKey={s.key as string} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ) : (
                  <Line
                    key={s.key}
                    dataKey={s.key as string}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 4, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ),
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
