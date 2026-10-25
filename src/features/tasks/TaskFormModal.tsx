import { CalendarPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Combobox, DateInput, Field, FormError, NumberInput, Segmented, Select, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { type Agreement, deleteTask, saveTask, type Task, todayIso } from '../../data/schedule'
import { buildIcs, openIcs } from '../../domain/ics'
import type { Recurrence } from '../../domain/schedule'
import { distinctNames } from '../../domain/text'
import { t } from '../../i18n/index'
import { describeRule, recurrenceLabel, weekdayNames } from './labels'
import { useSchedule } from './useSchedule'

export type TaskDraft = Omit<Task, 'id'> & { id?: string }

export function emptyTask(over: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: '',
    notes: null,
    category: null,
    recurrence: 'once',
    intervalN: 1,
    startDate: todayIso(),
    endDate: null,
    weekdays: [],
    dueTime: null,
    agreementId: null,
    active: true,
    ...over,
  }
}

/** Add-to-Calendar file for one task: reminder at its time, or 8:00 for all-day tasks. */
export function taskIcs(task: TaskDraft & { id: string }) {
  return buildIcs([
    {
      uid: `task-${task.id}`,
      title: task.title,
      description: [describeRule(task), task.notes].filter(Boolean).join('\n'),
      date: task.startDate,
      time: task.dueTime,
      rule: task,
      alarms: [task.dueTime ? 0 : -480],
    },
  ])
}

export function TaskFormModal({
  initial,
  agreements,
  onClose,
}: {
  initial: TaskDraft
  agreements: Agreement[]
  onClose: () => void
}) {
  const [f, setF] = useState<TaskDraft>(initial)
  const schedule = useSchedule()
  const categories = distinctNames((schedule.data?.tasks ?? []).map((x) => x.category)).map((label) => ({ label }))
  const [interval, setIntervalText] = useState(String(initial.intervalN))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    const n = Number(interval.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
    if (!f.title.trim()) return setError(t('اسم المهمة مطلوب.', 'The task name is required.'))
    if (!Number.isInteger(n) || n < 1 || n > 99) return setError(t('التكرار يجب أن يكون رقماً من 1 إلى 99.', 'Repeat must be 1–99.'))
    if (f.endDate && f.endDate < f.startDate) return setError(t('تاريخ الانتهاء قبل البداية.', 'End date is before the start.'))
    setBusy(true)
    setError(null)
    try {
      await saveTask({ ...f, title: f.title.trim(), intervalN: n, notes: f.notes?.trim() || null, category: f.category?.trim() || null, endDate: f.recurrence === 'once' ? null : f.endDate })
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!f.id) return
    const ok = await confirm({
      title: t('حذف المهمة', 'Delete task'),
      message: t('ستُحذف المهمة وسجل إنجازها.', 'The task and its history will be deleted.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTask(f.id)
      onClose()
    } catch (e) {
      setError(serverError(e))
    }
  }

  const unit = { once: '', daily: t('يوم', 'day(s)'), weekly: t('أسبوع', 'week(s)'), monthly: t('شهر', 'month(s)'), yearly: t('سنة', 'year(s)') }[f.recurrence]
  const names = weekdayNames()

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? t('تعديل مهمة', 'Edit task') : t('مهمة جديدة', 'New task')}
      footer={
        <>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {f.id && (
            <Button variant="secondary" onClick={() => openIcs(taskIcs({ ...f, id: f.id! }), 'zawrda-task.ics')} aria-label={t('إضافة إلى التقويم', 'Add to Calendar')}>
              <CalendarPlus className="size-5" />
            </Button>
          )}
          {f.id && (
            <Button variant="ghost" onClick={remove} aria-label={t('حذف', 'Delete')} className="text-red-700">
              <Trash2 className="size-5" />
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('المهمة', 'Task')}>
          <TextInput value={f.title} onChange={(e) => set('title', e.target.value)} placeholder={t('مثال: تعقيم خط التعبئة', 'e.g. Sanitise the filling line')} />
        </Field>
        <Field label={t('التكرار', 'Repeats')}>
          <Segmented<Recurrence>
            value={f.recurrence}
            onChange={(v) => set('recurrence', v)}
            options={(['once', 'daily', 'weekly', 'monthly', 'yearly'] as Recurrence[]).map((r) => ({ value: r, label: recurrenceLabel(r) }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f.recurrence === 'once' ? t('التاريخ', 'Date') : t('يبدأ من', 'Starts on')}>
            <DateInput value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          {f.recurrence !== 'once' && (
            <Field label={t('كل', 'Every')}>
              <NumberInput value={interval} onChange={(e) => setIntervalText(e.target.value)} suffix={unit} />
            </Field>
          )}
        </div>
        {f.recurrence === 'weekly' && (
          <Field label={t('في أيام', 'On')}>
            <div className="flex flex-wrap gap-2">
              {names.map((name, d) => {
                const on = f.weekdays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('weekdays', on ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort())}
                    className={`min-h-11 rounded-full border px-3 text-sm ${on ? 'border-brand-700 bg-brand-700 text-on-brand' : 'border-line'}`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الوقت (اختياري)', 'Time (optional)')}>
            <TextInput type="time" value={f.dueTime?.slice(0, 5) ?? ''} onChange={(e) => set('dueTime', e.target.value || null)} />
          </Field>
          {f.recurrence !== 'once' && (
            <Field label={t('ينتهي في (اختياري)', 'Ends on (optional)')}>
              <DateInput value={f.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('النوع', 'Category')}>
            <Combobox value={f.category ?? ''} onChange={(v) => set('category', v)} options={categories} />
          </Field>
          {agreements.length > 0 && (
            <Field label={t('مرتبطة باتفاقية (اختياري)', 'Linked agreement (optional)')}>
              <Select value={f.agreementId ?? ''} onChange={(e) => set('agreementId', e.target.value || null)}>
                <option value="">—</option>
                {agreements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label={t('ملاحظات', 'Notes')}>
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {f.title && <p className="text-sm text-muted">{describeRule({ ...f, intervalN: Number(interval) || 1 })}</p>}
        <FormError message={error} />
      </div>
      {dialog}
    </Modal>
  )
}
