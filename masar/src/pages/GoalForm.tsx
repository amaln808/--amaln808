import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { newId, useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { canManage } from '../domain/access'
import { goalsOf } from '../domain/goals'
import type { GoalIdea } from '../domain/insights'
import type { Goal, GoalPeriod, Kpi } from '../domain/types'
import { Button, Field, Input, Modal, NumberInput, Segmented, Select, Textarea } from '../components/ui'

export function GoalForm({ goal, presetEmployeeId, idea, onClose, onSaved }: { goal: Goal | null; presetEmployeeId?: string; idea?: GoalIdea; onClose: () => void; onSaved?: (g: Goal) => void }) {
  const me = useMe()
  const { db, today, save } = useStore()
  const { t, nm, tl } = usePrefs()
  const Y = today.slice(0, 4)
  const preset = db.employees.find((e) => e.id === presetEmployeeId)
  const [f, setF] = useState<Goal>(
    goal ?? {
      id: newId(),
      orgId: db.org.id,
      title: idea ? tl(idea.title) : '',
      description: idea ? tl(idea.description) : '',
      scope: 'individual',
      employeeIds: presetEmployeeId ? [presetEmployeeId] : [],
      departmentId: preset?.departmentId ?? null,
      weight: idea?.weight ?? 20,
      start: today > `${Y}-01-01` ? today : `${Y}-01-01`,
      end: `${Y}-12-31`,
      period: idea?.period ?? 'quarterly',
      kpis: idea ? idea.kpis.map((k) => ({ id: newId(), name: tl(k.name), unit: tl(k.unit), baseline: k.baseline, target: k.target, entries: [] })) : [{ id: newId(), name: '', unit: '', baseline: 0, target: 100, entries: [] }],
      status: 'active',
      createdById: me.id,
      createdAt: today,
      changes: [],
    },
  )
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const set = <K extends keyof Goal>(k: K, v: Goal[K]) => setF((x) => ({ ...x, [k]: v }))
  const setKpi = (i: number, patch: Partial<Kpi>) => set('kpis', f.kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)))
  const people = db.employees.filter((e) => e.active && canManage(me, e, db.employees))

  // Each owner's total weight once this goal is saved
  const owners = f.scope === 'individual' ? db.employees.filter((e) => f.employeeIds.includes(e.id)) : db.employees.filter((e) => e.active && (f.employeeIds.length ? f.employeeIds.includes(e.id) : e.departmentId === f.departmentId))
  const totals = owners.map((e) => ({ e, w: goalsOf(db.goals.filter((g) => g.id !== f.id), e).reduce((s, g) => s + g.weight, 0) + f.weight }))
  const over = totals.filter((x) => x.w > 100)

  const submit = () => {
    if (!f.title.trim()) return setErr(t('اكتب اسم الهدف', 'Enter the goal name'))
    if (f.scope === 'individual' && !f.employeeIds.length) return setErr(t('اختر موظفاً واحداً على الأقل', 'Choose at least one employee'))
    if (f.scope === 'team' && !f.departmentId) return setErr(t('اختر القسم', 'Choose the department'))
    if (f.end < f.start) return setErr(t('تاريخ النهاية قبل البداية', 'End date is before the start'))
    if (!(f.weight > 0 && f.weight <= 100)) return setErr(t('الوزن بين 1 و100', 'Weight must be 1–100'))
    const kpis = f.kpis.filter((k) => k.name.trim())
    if (!kpis.length) return setErr(t('أضف مؤشر أداء واحداً على الأقل', 'Add at least one KPI'))
    if (kpis.some((k) => k.baseline === k.target)) return setErr(t('المستهدف يجب أن يختلف عن نقطة البداية', 'Target must differ from the baseline'))
    if (goal && !reason.trim()) return setErr(t('اكتب سبب التعديل (يُحفظ في سجل الهدف)', 'Give a reason for the change (kept in the goal’s log)'))
    const out = { ...f, title: f.title.trim(), kpis, changes: goal ? [...f.changes, { at: today, byId: me.id, note: reason.trim() }] : f.changes }
    save('goals', out)
    onSaved?.(out)
    onClose()
  }

  return (
    <Modal title={goal ? t('تعديل الهدف', 'Edit goal') : t('هدف جديد', 'New goal')} onClose={onClose} wide>
      <div className="grid gap-3">
        <Field label={t('اسم الهدف', 'Goal name')}>
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t('الوصف', 'Description')}>
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented<Goal['scope']>
            label={t('النوع', 'Type')}
            value={f.scope}
            onChange={(v) => setF((x) => ({ ...x, scope: v, employeeIds: v === 'team' ? [] : x.employeeIds }))}
            options={[
              { value: 'individual', label: t('هدف فردي', 'Individual') },
              { value: 'team', label: t('هدف جماعي', 'Team') },
            ]}
          />
          {f.scope === 'team' && (
            <Field label={t('القسم', 'Department')} className="min-w-48 flex-1">
              <Select value={f.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value || null)}>
                <option value="">—</option>
                {db.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {nm(d)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">
            {f.scope === 'individual' ? t('الموظفون (يُطبّق الهدف على كل واحد منهم)', 'Employees (each one gets this goal)') : t('أعضاء الفريق (اتركه فارغاً = كل القسم)', 'Team members (leave empty = whole department)')}
          </legend>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
            {people
              .filter((e) => f.scope === 'individual' || e.departmentId === f.departmentId)
              .map((e) => {
                const on = f.employeeIds.includes(e.id)
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('employeeIds', on ? f.employeeIds.filter((x) => x !== e.id) : [...f.employeeIds, e.id])}
                    className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-button bg-button text-on-brand' : 'border-line hover:bg-brand-soft'}`}
                  >
                    {nm(e)}
                  </button>
                )
              })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label={t('الأهمية (الوزن %)', 'Importance (weight %)')}>
            <NumberInput value={f.weight} onChange={(n) => set('weight', n === '' ? 0 : n)} />
          </Field>
          <Field label={t('البداية', 'Start')}>
            <Input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label={t('النهاية', 'End')}>
            <Input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} />
          </Field>
          <Field label={t('المتابعة', 'Check-ins')}>
            <Select value={f.period} onChange={(e) => set('period', e.target.value as GoalPeriod)}>
              <option value="monthly">{t('شهرية', 'Monthly')}</option>
              <option value="quarterly">{t('ربع سنوية', 'Quarterly')}</option>
              <option value="annual">{t('سنوية', 'Annual')}</option>
            </Select>
          </Field>
        </div>
        {over.length > 0 && (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            {t('مجموع أوزان أهداف ', 'Total goal weight for ')}
            {over.map((x) => `${nm(x.e)} (${x.w}%)`).join('، ')}
            {t(' يتجاوز 100%. خفّض الوزن أو عدّل أهدافاً أخرى.', ' exceeds 100%. Lower the weight or adjust other goals.')}
          </p>
        )}
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">{t('مؤشرات الأداء (KPI)', 'Key performance indicators (KPIs)')}</legend>
          <div className="grid gap-2">
            {f.kpis.map((k, i) => (
              <div key={k.id} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <Input className="col-span-2 sm:col-span-1" placeholder={t('اسم المؤشر', 'KPI name')} value={k.name} onChange={(e) => setKpi(i, { name: e.target.value })} aria-label={t('اسم المؤشر', 'KPI name')} />
                <Input placeholder={t('الوحدة', 'Unit')} value={k.unit} onChange={(e) => setKpi(i, { unit: e.target.value })} aria-label={t('الوحدة', 'Unit')} />
                <NumberInput placeholder={t('البداية', 'Baseline')} value={k.baseline} onChange={(n) => setKpi(i, { baseline: n === '' ? 0 : n })} aria-label={t('نقطة البداية', 'Baseline')} />
                <NumberInput placeholder={t('المستهدف', 'Target')} value={k.target} onChange={(n) => setKpi(i, { target: n === '' ? 0 : n })} aria-label={t('المستهدف', 'Target')} />
                <Button kind="ghost" onClick={() => set('kpis', f.kpis.filter((_, j) => j !== i))} aria-label={t('حذف المؤشر', 'Remove KPI')} disabled={f.kpis.length === 1}>
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{t('إذا كان المستهدف أقل من البداية (مثل أيام التأخير) يُحسب التقدم بالنزول.', 'If the target is below the baseline (e.g. days late), progress counts downward.')}</p>
          <Button kind="quiet" className="mt-2 min-h-9" onClick={() => set('kpis', [...f.kpis, { id: newId(), name: '', unit: '', baseline: 0, target: 100, entries: [] }])}>
            <Plus size={16} /> {t('مؤشر آخر', 'Another KPI')}
          </Button>
        </fieldset>
        {goal && (
          <>
            <Field label={t('حالة الهدف', 'Goal status')}>
              <Select value={f.status} onChange={(e) => set('status', e.target.value as Goal['status'])}>
                <option value="active">{t('جارٍ', 'Active')}</option>
                <option value="done">{t('مكتمل', 'Done')}</option>
                <option value="cancelled">{t('ملغى', 'Cancelled')}</option>
              </Select>
            </Field>
            <Field label={t('سبب التعديل', 'Reason for the change')} hint={t('يُحفظ في سجل الهدف مع التاريخ واسمك.', 'Saved in the goal’s log with the date and your name.')}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      {err && <p className="mt-3 text-late">{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button kind="quiet" onClick={onClose}>
          {t('إلغاء', 'Cancel')}
        </Button>
        <Button onClick={submit}>{goal ? t('حفظ التعديل', 'Save change') : t('إنشاء الهدف', 'Create goal')}</Button>
      </div>
    </Modal>
  )
}
