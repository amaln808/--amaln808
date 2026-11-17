import { useMemo, useState } from 'react'
import { CalendarPlus, Plus, Star } from 'lucide-react'
import type { Recurrence } from '../../../src/domain/schedule'
import { addToCalendar, TaskForm } from '../components/TaskForm'
import { inScope, SCOPE_OPTIONS, useScopeFilter } from '../components/scope'
import { Button, Empty, Input, ScopeTag, Section, Segmented } from '../components/ui'
import { useStore, useToday, type Task } from '../data/store'
import { activeOn } from '../domain/performance'
import { repeatText } from '../format'

const GROUPS: { value: Recurrence; label: string }[] = [
  { value: 'daily', label: 'يومية' },
  { value: 'weekly', label: 'أسبوعية' },
  { value: 'monthly', label: 'شهرية' },
  { value: 'yearly', label: 'سنوية' },
  { value: 'once', label: 'لمرة واحدة' },
]

export function TasksPage() {
  const store = useStore()
  const today = useToday()
  const [scope, setScope] = useScopeFilter()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [showStopped, setShowStopped] = useState(false)

  const doneOnce = useMemo(() => new Set(store.done.map((d) => d.taskId)), [store.done])
  const list = useMemo(
    () =>
      store.tasks
        .filter(inScope(scope))
        .filter((t) => !q.trim() || `${t.title} ${t.category ?? ''} ${t.notes ?? ''}`.includes(q.trim()))
        .sort((a, b) => Number(b.important) - Number(a.important) || a.title.localeCompare(b.title, 'ar')),
    [store.tasks, scope, q],
  )
  const running = list.filter((t) => activeOn(t, today) && !(t.recurrence === 'once' && doneOnce.has(t.id)) && !(t.endDate && t.endDate < today))
  const finished = list.filter((t) => activeOn(t, today) && !running.includes(t))
  const stopped = list.filter((t) => !activeOn(t, today))

  const card = (t: Task, extra?: React.ReactNode) => (
    <li key={t.id} className="flex items-center gap-2 border-b border-line last:border-b-0">
      <button type="button" onClick={() => setEditing(t)} className="min-h-14 min-w-0 flex-1 px-4 py-3 text-start">
        <span className="flex items-center gap-1.5 font-medium">
          {t.important && <Star size={15} className="shrink-0 fill-saffron text-saffron" aria-label="مهمة" />}
          {t.title}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
          <ScopeTag scope={t.scope} />
          {t.category && <span>{t.category}</span>}
          <span>{repeatText(t)}</span>
          {t.dueTime && <span className="num">{t.dueTime}</span>}
        </span>
      </button>
      {extra ?? (
        <button
          type="button"
          onClick={() => addToCalendar(t)}
          aria-label={`إضافة «${t.title}» إلى التقويم`}
          title="إضافة إلى التقويم"
          className="me-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-brand-soft hover:text-ink"
        >
          <CalendarPlus size={20} />
        </button>
      )}
    </li>
  )

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">كل المهام</h1>
        <Segmented label="عرض" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>
      <div className="mt-4 flex gap-2">
        <Input type="search" placeholder="بحث في المهام" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setEditing('new')} className="shrink-0">
          <Plus size={20} aria-hidden /> مهمة
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted">
        زر التقويم بجانب كل مهمة يضيفها لتقويم الآيباد، فيصلكِ التنبيه حتى والتطبيق مغلق.
      </p>

      {running.length === 0 && <div className="mt-6"><Empty>{q ? 'لا نتائج.' : 'لا مهام جارية.'}</Empty></div>}
      {GROUPS.map((g) => {
        const rows = running.filter((t) => t.recurrence === g.value)
        return rows.length ? (
          <Section key={g.value} title={g.label} aside={<span className="num text-sm text-muted">{rows.length}</span>}>
            <ul className="rounded-2xl border border-line bg-card">{rows.map((t) => card(t))}</ul>
          </Section>
        ) : null
      })}

      {finished.length > 0 && (
        <Section title="انتهت" aside={<span className="num text-sm text-muted">{finished.length}</span>}>
          <ul className="rounded-2xl border border-line bg-card">{finished.slice(0, 30).map((t) => card(t, <span />))}</ul>
        </Section>
      )}

      {stopped.length > 0 && (
        <Section
          title="متوقفة"
          aside={
            <button type="button" className="min-h-11 text-sm text-button" onClick={() => setShowStopped((s) => !s)}>
              {showStopped ? 'إخفاء' : `عرض (${stopped.length})`}
            </button>
          }
        >
          {showStopped && (
            <ul className="rounded-2xl border border-line bg-card">
              {stopped.map((t) =>
                card(
                  t,
                  <Button kind="quiet" className="me-2 shrink-0" onClick={() => void store.restoreTask(t)}>
                    إعادة تشغيل
                  </Button>,
                ),
              )}
            </ul>
          )}
        </Section>
      )}

      {editing && (
        <TaskForm
          task={editing === 'new' ? undefined : editing}
          defaults={{ scope: scope === 'all' ? 'work' : scope }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
