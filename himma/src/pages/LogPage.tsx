import { useMemo, useState } from 'react'
import { CircleCheck, TrendingUp } from 'lucide-react'
import { periodRange, PERIODS, type Period } from '../components/periods'
import { inScope, SCOPE_OPTIONS, useScopeFilter } from '../components/scope'
import { Empty, ScopeTag, Segmented } from '../components/ui'
import { iso, useStore, useToday } from '../data/store'
import type { Scope } from '../domain/performance'
import { longDate, num } from '../format'

interface Item {
  key: string
  date: string
  at: string
  kind: 'task' | 'goal'
  scope: Scope
  title: string
  note: string | null
  amount?: string
}

/** Everything achieved, newest first: finished tasks (with their notes) and progress on goals. */
export function LogPage() {
  const store = useStore()
  const today = useToday()
  const [scope, setScope] = useScopeFilter()
  const [period, setPeriod] = useState<Period>('month')
  const [onlyNotes, setOnlyNotes] = useState(false)

  const items = useMemo(() => {
    const tasks = new Map(store.tasks.map((t) => [t.id, t]))
    const goals = new Map(store.goals.map((g) => [g.id, g]))
    const out: Item[] = []
    for (const d of store.done) {
      const t = tasks.get(d.taskId)
      if (t) out.push({ key: d.id, date: iso(new Date(d.doneAt)), at: d.doneAt, kind: 'task', scope: t.scope, title: t.title, note: d.note })
    }
    for (const e of store.entries) {
      const g = goals.get(e.goalId)
      if (g)
        out.push({
          key: e.id,
          date: e.date,
          at: e.date,
          kind: 'goal',
          scope: g.scope,
          title: g.title,
          note: e.note,
          amount: `${e.amount > 0 ? '+' : ''}${num(e.amount)}${g.unit ? ` ${g.unit}` : ''}`,
        })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }, [store.tasks, store.goals, store.done, store.entries])

  const earliest = items.length ? items[items.length - 1].date : today
  const [from, to] = periodRange(period, today, earliest)
  const shown = items.filter(inScope(scope)).filter((i) => i.date >= from && i.date <= to && (!onlyNotes || i.note || i.kind === 'goal'))
  const days = [...new Set(shown.map((i) => i.date))]

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">سجل الإنجازات</h1>
        <Segmented label="عرض" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <Segmented label="الفترة" value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--button)]" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} />
        ما كتبتُ عنه ملاحظة وتقدّم الأهداف فقط
      </label>
      <p className="mt-1 text-sm text-muted">
        {shown.length ? `${shown.filter((i) => i.kind === 'task').length} مهمة منجزة و${shown.filter((i) => i.kind === 'goal').length} تسجيل تقدّم في هذه الفترة.` : ''}
      </p>

      <div className="mt-4 space-y-6">
        {days.length === 0 && <Empty>لا إنجازات مسجّلة في هذه الفترة. كل مهمة تعلّمين عليها «تم» تظهر هنا.</Empty>}
        {days.map((d) => (
          <section key={d}>
            <h2 className="mb-2 text-sm font-bold text-muted">{d === today ? `اليوم — ${longDate(d)}` : longDate(d)}</h2>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
              {shown
                .filter((i) => i.date === d)
                .map((i) => (
                  <li key={i.key} className="flex gap-3 px-4 py-3">
                    {i.kind === 'task' ? (
                      <CircleCheck size={20} className="mt-0.5 shrink-0 text-good" aria-label="مهمة منجزة" />
                    ) : (
                      <TrendingUp size={20} className="mt-0.5 shrink-0 text-saffron" aria-label="تقدّم في هدف" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {i.title}
                        {i.amount && (
                          <span className="num ms-2 text-sm font-normal text-muted" dir="ltr">
                            {i.amount}
                          </span>
                        )}
                      </p>
                      {i.note && <p className="mt-0.5 text-sm">{i.note}</p>}
                      <div className="mt-0.5">
                        <ScopeTag scope={i.scope} />
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
