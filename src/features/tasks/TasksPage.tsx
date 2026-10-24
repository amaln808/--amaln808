import { CalendarPlus, Check, ChevronLeft, ListChecks, Plus, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormError, Segmented } from '../../components/form'
import { Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { completeTask, type Task, uncompleteTask } from '../../data/schedule'
import { buildIcs, openIcs } from '../../domain/ics'
import { type DueItem, nextOccurrence, type Recurrence, upcoming } from '../../domain/schedule'
import { t } from '../../i18n/index'
import { categoryLabel, daysLeftLabel, describeRule, formatDate, kindLabel, recurrenceLabel } from './labels'
import { emptyTask, type TaskDraft, TaskFormModal } from './TaskFormModal'
import { useSchedule } from './useSchedule'

type Tab = 'today' | Recurrence

/** Ready-made factory tasks offered when the list is empty. */
function suggestions(today: string): TaskDraft[] {
  return [
    emptyTask({ title: t('تعقيم أدوات وخط التعبئة', 'Sanitise tools and filling line'), recurrence: 'daily', category: 'cleaning', startDate: today }),
    emptyTask({ title: t('جرد المخزون', 'Stock count'), recurrence: 'weekly', category: 'inventory', startDate: today }),
    emptyTask({ title: t('معايرة الميزان', 'Calibrate the scale'), recurrence: 'monthly', category: 'quality', startDate: today }),
    emptyTask({ title: t('فحص مختبر لعينة من الإنتاج', 'Lab test of a production sample'), recurrence: 'monthly', intervalN: 3, category: 'quality', startDate: today }),
    emptyTask({ title: t('تجديد السجل التجاري', 'Renew commercial registration'), recurrence: 'yearly', category: 'admin', startDate: today }),
  ]
}

function TickRow({ item, onEdit }: { item: DueItem<Task>; onEdit: (t: Task) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = async () => {
    setBusy(true)
    setError(null)
    try {
      if (item.done) await uncompleteTask(item.task.id, item.date)
      else await completeTask(item.task.id, item.date)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={item.done}
        aria-label={item.done ? t('إلغاء الإنجاز', 'Mark not done') : t('تم', 'Done')}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition ${
          item.done ? 'border-palm bg-palm text-white' : item.overdue ? 'border-red-600' : 'border-line hover:border-brand-500'
        }`}
      >
        {item.done && <Check className="size-5" />}
      </button>
      <button type="button" onClick={() => onEdit(item.task)} className="min-w-0 flex-1 text-start">
        <div className={`font-medium ${item.done ? 'text-muted line-through' : ''}`}>{item.task.title}</div>
        <div className="text-sm text-muted">
          {item.overdue ? <span className="text-red-700">{t(`متأخرة — كانت في ${formatDate(item.date)}`, `Overdue — was due ${formatDate(item.date)}`)}</span> : describeRule(item.task)}
          {item.task.dueTime && <span className="num"> · {item.task.dueTime.slice(0, 5)}</span>}
        </div>
        <FormError message={error} />
      </button>
    </li>
  )
}

export function TasksPage() {
  const s = useSchedule()
  const [tab, setTab] = useState<Tab>('today')
  const [editing, setEditing] = useState<TaskDraft | null>(null)
  const data = s.data

  const soon = useMemo(() => (data ? upcoming(data.tasks, s.todayDate, 7) : []), [data, s.todayDate])

  const exportAll = () => {
    if (!data) return
    const events = data.tasks
      .filter((x) => x.active)
      .map((task) => ({
        uid: `task-${task.id}`,
        title: task.title,
        description: describeRule(task),
        date: task.startDate,
        time: task.dueTime,
        rule: task,
        alarms: [task.dueTime ? 0 : -480],
      }))
    openIcs(buildIcs(events), 'zawrda-tasks.ics')
  }

  const open = data?.tasks.filter((x) => x.active) ?? []
  const counts = Object.fromEntries((['once', 'daily', 'weekly', 'monthly', 'yearly'] as Recurrence[]).map((r) => [r, open.filter((x) => x.recurrence === r).length]))
  const todayOpen = s.today.filter((i) => !i.done).length

  return (
    <>
      <PageHeader
        title={t('مهامي', 'My tasks')}
        subtitle={t('كل أعمال المصنع المجدولة، وتنبيهات الاتفاقيات والتصاريح.', 'All scheduled factory work, plus agreement and permit alerts.')}
        actions={
          <>
            <Button variant="secondary" onClick={exportAll} disabled={!open.length}>
              <CalendarPlus className="size-5" />
              {t('إضافة الكل للتقويم', 'Add all to Calendar')}
            </Button>
            <Button onClick={() => setEditing(emptyTask({ recurrence: tab === 'today' ? 'once' : tab }))}>
              <Plus className="size-5" />
              {t('مهمة جديدة', 'New task')}
            </Button>
          </>
        }
      />

      <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="min-w-[36rem]">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: todayOpen ? `${t('اليوم', 'Today')} (${todayOpen})` : t('اليوم', 'Today') },
            ...(['daily', 'weekly', 'monthly', 'yearly', 'once'] as Recurrence[]).map((r) => ({
              value: r,
              label: counts[r] ? `${recurrenceLabel(r)} (${counts[r]})` : recurrenceLabel(r),
            })),
          ]}
        />
        </div>
      </div>

      {s.error && !data && <FormError message={serverError(s.error)} />}
      {s.fromCache && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('غير متصل — يمكن تعليم المهام كمنجزة وتُرسل عند عودة الاتصال.', 'Offline — you can still tick tasks; they are sent when back online.')}
        </p>
      )}

      {tab === 'today' ? (
        <div className="flex flex-col gap-5">
          {s.alerts.length > 0 && (
            <Card className={s.alerts.some((a) => a.status === 'expired') ? 'border-red-300' : 'border-amber-300'}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t('اتفاقيات وتصاريح تحتاج انتباهك', 'Agreements and permits needing attention')}</h2>
                <Link to="/agreements" className="inline-flex min-h-11 items-center text-sm text-brand-800">
                  {t('الكل', 'All')}
                  <ChevronLeft className="size-4 ltr:rotate-180" />
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {s.alerts.map(({ agreement: a, status, daysLeft }) => (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <ScrollText className={`size-5 shrink-0 ${status === 'expired' ? 'text-red-700' : 'text-amber-800'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-sm text-muted">{kindLabel(a.kind)}</div>
                    </div>
                    <span className={`text-sm font-medium ${status === 'expired' ? 'text-red-700' : 'text-amber-800'}`}>{daysLeftLabel(daysLeft)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 text-lg font-bold">{t('مهام اليوم', 'Today')}</h2>
            {s.today.length ? (
              <ul className="divide-y divide-line">
                {s.today.map((i) => (
                  <TickRow key={`${i.task.id}|${i.date}`} item={i} onEdit={(task) => setEditing(task)} />
                ))}
              </ul>
            ) : data && !data.tasks.length ? (
              <div>
                <EmptyState icon={ListChecks} title={t('لا توجد مهام بعد', 'No tasks yet')} description={t('يمكن البدء بمهمة جاهزة أو إضافة مهمة جديدة.', 'Start from a suggestion or add your own.')} />
                <div className="flex flex-wrap justify-center gap-2 pb-4">
                  {suggestions(s.todayDate).map((x) => (
                    <button key={x.title} type="button" onClick={() => setEditing(x)} className="min-h-11 rounded-full border border-line px-4 text-sm hover:bg-brand-50">
                      + {x.title} · {recurrenceLabel(x.recurrence)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-4 text-muted">{s.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا شيء مطلوب اليوم.', 'Nothing due today.')}</p>
            )}
          </Card>

          {soon.length > 0 && (
            <Card>
              <h2 className="mb-2 text-lg font-bold">{t('خلال الأيام السبعة القادمة', 'Next 7 days')}</h2>
              <ul className="divide-y divide-line">
                {soon.map((i) => (
                  <li key={`${i.task.id}|${i.date}`}>
                    <button type="button" onClick={() => setEditing(i.task)} className="flex min-h-12 w-full items-center gap-3 py-2 text-start">
                      <span className="num w-20 shrink-0 text-sm text-muted">{formatDate(i.date)}</span>
                      <span className="flex-1">{i.task.title}</span>
                      <span className="text-xs text-muted">{recurrenceLabel(i.task.recurrence)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-0">
          {(() => {
            const list = (data?.tasks ?? []).filter((x) => x.recurrence === tab)
            if (!list.length)
              return <EmptyState icon={ListChecks} title={t(`لا توجد مهام ${recurrenceLabel(tab)}`, `No ${recurrenceLabel(tab).toLowerCase()} tasks`)} />
            return (
              <ul className="divide-y divide-line">
                {list.map((task) => {
                  const next = task.active ? nextOccurrence(task, s.todayDate) : null
                  return (
                    <li key={task.id}>
                      <button type="button" onClick={() => setEditing(task)} className={`flex w-full items-center gap-3 px-5 py-4 text-start ${task.active ? '' : 'opacity-50'}`}>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{task.title}</div>
                          <div className="text-sm text-muted">
                            {describeRule(task)} · {categoryLabel(task.category)}
                          </div>
                        </div>
                        <div className="text-end text-sm">
                          <div className="text-muted">{t('القادمة', 'Next')}</div>
                          <div className="num">{next ? formatDate(next) : '—'}</div>
                        </div>
                        <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          })()}
        </Card>
      )}

      {editing && <TaskFormModal initial={editing} agreements={(data?.agreements ?? []).filter((a) => a.active)} onClose={() => setEditing(null)} />}
    </>
  )
}
