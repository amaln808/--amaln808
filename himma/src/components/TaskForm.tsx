import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus } from 'lucide-react'
import { buildIcs, openIcs } from '../../../src/domain/ics'
import type { Recurrence } from '../../../src/domain/schedule'
import { errorText } from '../data/client'
import { iso, useStore, type Task } from '../data/store'
import type { Scope } from '../domain/performance'
import { parseNum, repeatText, WEEKDAYS_SHORT } from '../format'
import { Button, ErrorText, Field, Input, Modal, Segmented, Suggest, inputClass } from './ui'

const REPEAT: { value: Recurrence; label: string }[] = [
  { value: 'once', label: 'مرة واحدة' },
  { value: 'daily', label: 'يومية' },
  { value: 'weekly', label: 'أسبوعية' },
  { value: 'monthly', label: 'شهرية' },
  { value: 'yearly', label: 'سنوية' },
]
const UNIT: Record<Recurrence, string> = { once: '', daily: 'يوم', weekly: 'أسبوع', monthly: 'شهر', yearly: 'سنة' }

export function addToCalendar(t: Task) {
  const ics = buildIcs([
    {
      uid: `himma-${t.id}`,
      title: t.title,
      description: t.notes ?? undefined,
      date: t.startDate,
      time: t.dueTime,
      rule: t,
      // at the task's time, or 8:00 in the morning for a task without a time
      alarms: [t.dueTime ? 0 : -480],
    },
  ])
  openIcs(ics, 'himma-task.ics')
}

export function TaskForm({ task, defaults, onClose }: { task?: Task; defaults?: Partial<Task>; onClose: () => void }) {
  const store = useStore()
  const categories = useMemo(
    () => [...new Set(store.tasks.map((t) => t.category).filter((c): c is string => !!c))].sort(),
    [store.tasks],
  )
  // a new task can arrive pre-filled (from the voice input)
  const src: Partial<Task> | undefined = task ?? defaults
  const [f, setF] = useState({
    title: src?.title ?? '',
    scope: (src?.scope ?? 'work') as Scope,
    category: src?.category ?? '',
    important: src?.important ?? false,
    recurrence: src?.recurrence ?? ('once' as Recurrence),
    intervalN: String(src?.intervalN ?? 1),
    weekdays: src?.weekdays ?? [],
    startDate: src?.startDate ?? iso(new Date()),
    endDate: src?.endDate ?? '',
    dueTime: src?.dueTime ?? '',
    notes: src?.notes ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const once = f.recurrence === 'once'
  const n = Math.max(1, Math.min(99, Math.round(parseNum(f.intervalN) ?? 1)))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!f.title.trim()) return setError('اكتبي اسم المهمة.')
    if (!once && f.endDate && f.endDate < f.startDate) return setError('تاريخ النهاية قبل تاريخ البداية.')
    setBusy(true)
    setError('')
    try {
      await store.saveTask({
        id: task?.id,
        title: f.title.trim(),
        scope: f.scope,
        category: f.category.trim() || null,
        important: f.important,
        recurrence: f.recurrence,
        intervalN: once ? 1 : n,
        weekdays: f.recurrence === 'weekly' ? [...f.weekdays].sort() : [],
        startDate: f.startDate,
        endDate: once || !f.endDate ? null : f.endDate,
        dueTime: f.dueTime || null,
        notes: f.notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!task) return
    const used = store.done.some((d) => d.taskId === task.id)
    const q = used
      ? 'لهذه المهمة إنجازات مسجّلة، لذلك ستتوقف من اليوم وتبقى إنجازاتها في السجل والأداء. متابعة؟'
      : 'حذف هذه المهمة نهائياً؟'
    if (!confirm(q)) return
    setBusy(true)
    try {
      await store.removeTask(task)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={task ? 'تعديل المهمة' : 'مهمة جديدة'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="المهمة">
          <Input autoFocus={!task} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="مثال: متابعة عرض الأسعار مع الصيدلية" />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1 block text-sm font-medium text-muted">النوع</span>
            <Segmented
              label="النوع"
              value={f.scope}
              onChange={(v) => set('scope', v)}
              options={[
                { value: 'work', label: 'عمل' },
                { value: 'personal', label: 'شخصي' },
              ]}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-[var(--button)]" checked={f.important} onChange={(e) => set('important', e.target.checked)} />
            مهمة مهمة (تظهر أولاً)
          </label>
        </div>
        <Field label="التصنيف (اختياري)" hint="اكتبي تصنيفاً جديداً أو اختاري مما كتبتِه سابقاً.">
          <Suggest options={categories} value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="مبيعات، صحة، تعلّم…" />
        </Field>

        <Field label="التكرار">
          <select className={inputClass} value={f.recurrence} onChange={(e) => set('recurrence', e.target.value as Recurrence)}>
            {REPEAT.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        {!once && (
          <Field label={`كل كم ${UNIT[f.recurrence]}؟`}>
            <Input inputMode="numeric" className="max-w-28" value={f.intervalN} onChange={(e) => set('intervalN', e.target.value)} />
          </Field>
        )}
        {f.recurrence === 'weekly' && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-muted">في أيام</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS_SHORT.map((d, i) => {
                const on = f.weekdays.includes(i)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('weekdays', on ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i])}
                    className={`min-h-11 min-w-14 rounded-xl border px-2 text-sm ${on ? 'border-button bg-button text-on-brand' : 'border-line bg-card'}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-muted">بلا اختيار = نفس يوم تاريخ البداية.</p>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={once ? 'التاريخ' : 'تبدأ من'}>
            <Input type="date" required value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          {!once && (
            <Field label="تنتهي في (اختياري)">
              <Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          )}
          <Field label="الوقت (اختياري)">
            <Input type="time" value={f.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-muted">
          {repeatText({ recurrence: f.recurrence, intervalN: n, weekdays: f.weekdays, startDate: f.startDate })}
        </p>
        <Field label="ملاحظات (اختياري)">
          <textarea className={`${inputClass} min-h-20 py-2`} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
          {task && (
            <Button kind="quiet" onClick={() => addToCalendar(task)}>
              <CalendarPlus size={18} aria-hidden /> إضافة إلى التقويم
            </Button>
          )}
          {task && (
            <Button kind="danger" className="ms-auto" disabled={busy} onClick={remove}>
              {store.done.some((d) => d.taskId === task.id) ? 'إيقاف المهمة' : 'حذف'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
