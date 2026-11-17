import { useMemo, useState } from 'react'
import { dueToday, upcoming } from '../../../src/domain/schedule'
import { TaskForm } from '../components/TaskForm'
import { TaskRow } from '../components/TaskRow'
import { inScope, SCOPE_OPTIONS, useScopeFilter } from '../components/scope'
import { Empty, Section, Segmented } from '../components/ui'
import { useStore, useToday, type Task } from '../data/store'
import { activeOn, doneKey, doneSet, streak, weekDays, type DayCell } from '../domain/performance'
import { day } from '../../../src/domain/schedule'
import { longDate, WEEKDAYS_SHORT } from '../format'

const byImportance = (a: { task: Task }, b: { task: Task }) =>
  Number(b.task.important) - Number(a.task.important) ||
  (a.task.dueTime ?? '99').localeCompare(b.task.dueTime ?? '99') ||
  a.task.title.localeCompare(b.task.title, 'ar')

export function TodayPage() {
  const store = useStore()
  const today = useToday()
  const [scope, setScope] = useScopeFilter()
  const [editing, setEditing] = useState<Task | null>(null)

  const tasks = useMemo(() => store.tasks.filter(inScope(scope)), [store.tasks, scope])
  const done = useMemo(() => doneSet(store.done), [store.done])
  const doneByKey = useMemo(() => new Map(store.done.map((d) => [doneKey(d.taskId, d.dueDate), d])), [store.done])

  const items = useMemo(() => dueToday(tasks.map((t) => ({ ...t, active: activeOn(t, today) })), done, today), [tasks, done, today])
  const overdue = items.filter((i) => i.overdue).sort(byImportance)
  const todays = items.filter((i) => !i.overdue).sort((a, b) => Number(a.done) - Number(b.done) || byImportance(a, b))
  const next = useMemo(() => upcoming(tasks.filter((t) => t.recurrence !== 'daily').map((t) => ({ ...t, active: activeOn(t, today) })), today, 7), [tasks, today])
  const week = useMemo(() => weekDays(tasks, done, today), [tasks, done, today])
  const run = useMemo(() => streak(tasks, done, today), [tasks, done, today])
  const doneToday = todays.filter((i) => i.done).length

  const row = (i: (typeof items)[number], showDate = false) => (
    <TaskRow
      key={`${i.task.id}|${i.date}`}
      task={i.task as Task}
      date={i.date}
      done={doneByKey.get(doneKey(i.task.id, i.date))}
      overdue={i.overdue}
      showDate={showDate}
      onEdit={() => setEditing(i.task as Task)}
    />
  )

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{longDate(today)}</h1>
          <p className="mt-1 text-muted">
            {todays.length === 0
              ? 'لا مهام لليوم.'
              : doneToday === todays.length
                ? `أنجزتِ مهام اليوم كلها (${todays.length}).`
                : `أنجزتِ ${doneToday} من ${todays.length} اليوم.`}
            {run > 1 && ` أيام متتالية بإنجاز كامل: ${run}.`}
          </p>
        </div>
        <Segmented label="عرض" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>

      <WeekLadder days={week} today={today} />

      {overdue.length > 0 && (
        <Section title="فاتت ولم تُنجز" aside={<span className="text-sm text-late">{overdue.length}</span>}>
          <ul className="rounded-2xl border border-line bg-card">{overdue.map((i) => row(i))}</ul>
        </Section>
      )}

      <Section title="مهام اليوم">
        {todays.length ? (
          <ul className="rounded-2xl border border-line bg-card">{todays.map((i) => row(i))}</ul>
        ) : (
          <Empty>{store.tasks.length ? 'لا شيء مجدول لليوم.' : 'اضغطي الميكروفون وقولي أول مهمة، مثل: «متابعة الطلبيات كل يوم الساعة 9».'}</Empty>
        )}
      </Section>

      {next.length > 0 && (
        <Section title="القادم خلال 7 أيام" aside={<span className="text-xs text-muted">بلا المهام اليومية</span>}>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {next.slice(0, 12).map((i) => (
              <li key={`${i.task.id}|${i.date}`}>
                <button type="button" onClick={() => setEditing(i.task as Task)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start">
                  <span className="w-24 shrink-0 text-sm text-muted">{longDate(i.date).split('،')[0]} {day(i.date).getDate()}</span>
                  <span className={`size-2 shrink-0 rounded-full ${i.task.scope === 'work' ? 'bg-work' : 'bg-personal'}`} aria-label={i.task.scope === 'work' ? 'عمل' : 'شخصي'} />
                  <span className="min-w-0 flex-1">{i.task.title}</span>
                  {i.task.dueTime && <span className="num text-sm text-muted">{i.task.dueTime}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {editing && (
        <TaskForm
          task={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

/**
 * The week as seven rising columns, Sunday → Saturday. Each fills with the share
 * of that day's tasks that were done; a fully done day turns saffron.
 */
function WeekLadder({ days, today }: { days: DayCell[]; today: string }) {
  return (
    <figure className="mt-5 rounded-2xl border border-line bg-card p-4">
      <figcaption className="sr-only">إنجاز أيام هذا الأسبوع</figcaption>
      <ol className="grid grid-cols-7 gap-2 sm:gap-3">
        {days.map((d) => {
          const isToday = d.date === today
          const full = d.rate === 1
          const h = d.rate === null ? 0 : Math.max(d.done ? 6 : 0, Math.round(d.rate * 100))
          const label = `${WEEKDAYS_SHORT[day(d.date).getDay()]} ${day(d.date).getDate()}: ${
            d.planned === 0 ? 'لا مهام' : d.future ? `${d.planned} مجدولة` : `${d.done} من ${d.planned}`
          }`
          return (
            <li key={d.date} aria-label={label} title={label} className="flex flex-col items-center gap-2">
              <div
                className={`relative h-24 w-full max-w-14 overflow-hidden rounded-xl sm:h-28 ${
                  d.future ? 'border border-dashed border-line' : 'bg-brand-soft'
                } ${isToday ? 'ring-2 ring-button ring-offset-2 ring-offset-card' : ''}`}
              >
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-t-[4px] transition-[height] duration-500 ${full ? 'bg-saffron' : 'bg-button'}`}
                  style={{ height: `${h}%` }}
                />
                {d.planned > 0 && (
                  <span className={`num absolute inset-x-0 top-1.5 text-center text-xs ${h > 80 ? 'text-on-brand' : 'text-muted'}`}>
                    {d.future ? d.planned : `${d.done}/${d.planned}`}
                  </span>
                )}
              </div>
              <span className={`text-center text-xs leading-tight ${isToday ? 'font-bold text-ink' : 'text-muted'}`}>
                {WEEKDAYS_SHORT[day(d.date).getDay()]}
                <span className="num block">{day(d.date).getDate()}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
