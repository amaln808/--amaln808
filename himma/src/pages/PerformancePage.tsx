import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { periodRange, PERIODS, type Period } from '../components/periods'
import { inScope, SCOPE_OPTIONS, useScopeFilter } from '../components/scope'
import { Empty, Section, Segmented } from '../components/ui'
import { useStore, useToday } from '../data/store'
import { goalProgress } from '../domain/goals'
import { whole } from './GoalsPage'
import { doneSet, periodStats, slipping, streak, weeklySeries, type Stats } from '../domain/performance'
import { num, pct, shortDate } from '../format'

export function PerformancePage() {
  const store = useStore()
  const today = useToday()
  const [scope, setScope] = useScopeFilter()
  const [period, setPeriod] = useState<Period>('month')

  const tasks = useMemo(() => store.tasks.filter(inScope(scope)), [store.tasks, scope])
  const done = useMemo(() => doneSet(store.done), [store.done])
  const earliest = useMemo(() => tasks.reduce((m, t) => (t.startDate < m ? t.startDate : m), today), [tasks, today])
  const [from, to] = periodRange(period, today, earliest)
  const s = useMemo(() => periodStats(tasks, done, from, to, today), [tasks, done, from, to, today])
  const run = useMemo(() => streak(tasks, done, today), [tasks, done, today])
  const slip = useMemo(() => slipping(tasks, done, from, to, today).slice(0, 5), [tasks, done, from, to, today])
  const goals = store.goals.filter(inScope(scope)).filter((g) => !g.archived && g.endDate >= today && g.startDate <= today)
  const goalRows = goals.map((g) => ({ g, p: goalProgress(g, store.entries.filter((e) => e.goalId === g.id).map((e) => e.amount), today) }))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">الأداء</h1>
        <Segmented label="عرض" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <Segmented label="الفترة" value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <p className="mt-2 text-sm text-muted">
        من {shortDate(from)} إلى {shortDate(to < today ? to : today)} — الأيام القادمة لا تُحسب بعد.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="نسبة الإنجاز" value={pct(s.rate)} sub={`${s.done} من ${s.planned} مهمة`} />
        <Tile label="أيام متتالية بإنجاز كامل" value={String(run)} sub="حتى اليوم" />
        {scope !== 'personal' && <Tile label="العمل" value={pct(s.work.rate)} sub={sub(s.work)} dot="bg-work" />}
        {scope !== 'work' && <Tile label="الشخصي" value={pct(s.personal.rate)} sub={sub(s.personal)} dot="bg-personal" />}
      </div>

      <WeeklyChart scope={scope} />

      <Section title="أهدافك الجارية">
        {goalRows.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {goalRows.map(({ g, p }) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1 font-medium">{g.title}</span>
                <span className="num text-sm text-muted">
                  {num(p.total)} / {num(g.target)} {g.unit}
                </span>
                <span className={`text-sm font-medium ${p.status === 'behind' ? 'text-late' : 'text-good'}`}>
                  {p.status === 'reached' ? 'تحقق' : p.status === 'behind' ? `أبطأ (المتوقع ${whole(p.expected, g.target)})` : 'على الخطة'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>لا أهداف جارية.</Empty>
        )}
      </Section>

      <Section title="مهام تفوتكِ أكثر في هذه الفترة">
        {slip.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {slip.map((r) => {
              const t = store.tasks.find((x) => x.id === r.taskId)!
              return (
                <li key={r.taskId} className="flex items-center gap-4 px-4 py-3">
                  <span className="min-w-0 flex-1">{t.title}</span>
                  <span className="num text-sm text-muted">
                    {r.done} من {r.planned}
                  </span>
                  <span className="num w-12 text-end font-medium">{pct(r.rate)}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>{s.planned ? 'لم تفتكِ أي مهمة في هذه الفترة.' : 'لا مهام في هذه الفترة.'}</Empty>
        )}
      </Section>
    </>
  )
}

const sub = (x: Stats) => (x.planned ? `${x.done} من ${x.planned}` : 'لا مهام')

function Tile({ label, value, sub, dot }: { label: string; value: string; sub: string; dot?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {dot && <span className={`size-2 rounded-full ${dot}`} aria-hidden />}
        {label}
      </p>
      <p className="num mt-1 text-3xl font-bold">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  )
}

/** Completion rate per week for the last 12 weeks, work and personal side by side. */
function WeeklyChart({ scope }: { scope: 'all' | 'work' | 'personal' }) {
  const store = useStore()
  const today = useToday()
  const [table, setTable] = useState(false)
  const rows = useMemo(() => {
    const tasks = store.tasks.filter(inScope(scope))
    return weeklySeries(tasks, doneSet(store.done), today, 12).map((w) => ({
      label: shortDate(w.start),
      start: w.start,
      work: w.work.rate === null ? null : Math.round(w.work.rate * 100),
      personal: w.personal.rate === null ? null : Math.round(w.personal.rate * 100),
      workSub: sub(w.work),
      personalSub: sub(w.personal),
    }))
  }, [store.tasks, store.done, scope, today])
  const series = [
    { key: 'work', name: 'العمل', color: 'var(--work)' },
    { key: 'personal', name: 'الشخصي', color: 'var(--personal)' },
  ].filter((x) => scope === 'all' || x.key === scope)
  const empty = rows.every((r) => r.work === null && r.personal === null)

  return (
    <Section
      title="نسبة الإنجاز أسبوعياً (آخر 12 أسبوعاً)"
      aside={
        <button type="button" className="min-h-11 text-sm text-button" onClick={() => setTable((t) => !t)}>
          {table ? 'رسم بياني' : 'جدول'}
        </button>
      }
    >
      <div className="rounded-2xl border border-line bg-card p-3">
        {empty ? (
          <p className="py-10 text-center text-muted">يظهر الرسم بعد أول أسبوع من المهام.</p>
        ) : table ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-2 text-start font-medium">الأسبوع من</th>
                {series.map((s) => (
                  <th key={s.key} className="py-2 text-start font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows].reverse().map((r) => (
                <tr key={r.start}>
                  <td className="py-2">{r.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num py-2">
                      {r[s.key as 'work'] === null ? '—' : `${r[s.key as 'work']}%`}{' '}
                      <span className="text-xs text-muted">({r[`${s.key}Sub` as 'workSub']})</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" reversed tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis orientation="right" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  cursor={{ fill: 'var(--brand-soft)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as (typeof rows)[number]
                    return (
                      <div dir="rtl" className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink shadow">
                        <p className="font-medium">الأسبوع من {r.label}</p>
                        {series.map((s) => (
                          <p key={s.key} className="mt-1 flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ background: s.color }} />
                            {s.name}: <span className="num">{r[s.key as 'work'] === null ? '—' : `${r[s.key as 'work']}%`}</span>
                            <span className="text-xs text-muted">({r[`${s.key}Sub` as 'workSub']})</span>
                          </p>
                        ))}
                      </div>
                    )
                  }}
                />
                {series.length > 1 && (
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={28}
                    content={() => (
                      <div dir="rtl" className="flex gap-4 pb-2 text-sm text-muted">
                        {series.map((s) => (
                          <span key={s.key} className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
                            {s.name}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                )}
                {series.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Section>
  )
}
