import { useState, type ReactNode } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { usePrefs } from '../i18n'

/** Every chart has a table view (contrast relief and screen readers) */
export function ChartFrame({ title, note, head, rows, children }: { title: string; note?: ReactNode; head: string[]; rows: (string | number)[][]; children: ReactNode }) {
  const { t } = usePrefs()
  const [table, setTable] = useState(false)
  return (
    <section className="rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <div>
          <h2 className="font-bold">{title}</h2>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
        <button type="button" data-html2canvas-ignore onClick={() => setTable(!table)} className="no-print inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-brand-soft hover:text-ink">
          {table ? <BarChart3 size={16} /> : <Table2 size={16} />}
          {table ? t('رسم', 'Chart') : t('جدول', 'Table')}
        </button>
      </div>
      <div className="p-3">
        {table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  {head.map((h) => (
                    <th key={h} className="px-2 py-1.5 text-start font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className="num px-2 py-1.5">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64" dir="ltr">
            {children}
          </div>
        )}
      </div>
    </section>
  )
}

const axis = { stroke: 'var(--line)', tick: { fill: 'var(--muted)', fontSize: 12 }, tickLine: false }
const tip = {
  contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'inherit' },
  labelStyle: { color: 'var(--ink)', fontWeight: 700 },
  itemStyle: { color: 'var(--ink)' },
  cursor: { fill: 'var(--brand-soft)', stroke: 'var(--muted)', strokeWidth: 1 },
}

export interface Series {
  key: string
  name: string
  color: string
  dashed?: boolean
}

/** Lines over time, one axis, 2px strokes, markers ≥ 8px */
export function Lines({ data, x, series, unit = '%', domain = [0, 100], rtl }: { data: Record<string, unknown>[]; x: string; series: Series[]; unit?: string; domain?: [number, number]; rtl: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={false} />
        <XAxis dataKey={x} {...axis} reversed={rtl} />
        <YAxis {...axis} domain={domain} unit={unit} orientation={rtl ? 'right' : 'left'} width={52} />
        <Tooltip {...tip} formatter={(v) => `${v}${unit}`} />
        {series.length > 1 && <Legend wrapperStyle={{ color: 'var(--ink)', fontSize: 13 }} />}
        {series.map((s) => (
          <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: s.color }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Bars (grouped when several series), 4px rounded data ends, 2px gaps */
export function Bars({ data, x, series, unit = '%', domain = [0, 100], rtl, horizontal = false }: { data: Record<string, unknown>[]; x: string; series: Series[]; unit?: string; domain?: [number, number]; rtl: boolean; horizontal?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid stroke="var(--line)" strokeOpacity={0.6} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} domain={domain} unit={unit} reversed={rtl} />
            <YAxis type="category" dataKey={x} {...axis} width={110} orientation={rtl ? 'right' : 'left'} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} reversed={rtl} interval={0} />
            <YAxis {...axis} domain={domain} unit={unit} orientation={rtl ? 'right' : 'left'} width={52} />
          </>
        )}
        <Tooltip {...tip} formatter={(v) => `${v}${unit}`} />
        {series.length > 1 && <Legend wrapperStyle={{ color: 'var(--ink)', fontSize: 13 }} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={horizontal ? (rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]) : [4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)']
