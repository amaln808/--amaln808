import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Pencil, Plus } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { canManage, visibleEmployees } from '../domain/access'
import { checkpoints, expectedProgress, goalHealth, goalProgress, isGoalOf, kpiProgress, kpiValueAt, projectedProgress } from '../domain/goals'
import type { Kpi } from '../domain/types'
import { Button, Field, HealthBadge, Input, Meter, Modal, NumberInput, PageHead, Pill, Sheet } from '../components/ui'
import { useLookups } from '../components/lookups'
import { GoalForm } from './GoalForm'

export function GoalPage() {
  const { id } = useParams()
  const me = useMe()
  const { db, today, save } = useStore()
  const { t, tl, pct, num, date } = usePrefs()
  const lk = useLookups()
  const [editing, setEditing] = useState(false)
  const [update, setUpdate] = useState<Kpi | null>(null)
  const goal = db.goals.find((g) => g.id === id)
  const team = visibleEmployees(me, db.employees)
  if (!goal) return <Navigate to="/goals" />
  const members = db.employees.filter((e) => isGoalOf(goal, e))
  const allowed = me.role === 'admin' || me.role === 'hr' || members.some((m) => team.some((x) => x.id === m.id))
  if (!allowed) return <Navigate to="/goals" />
  const mine = members.some((m) => m.id === me.id)
  const manage = me.role === 'admin' || me.role === 'hr' || members.some((m) => canManage(me, m, db.employees))
  const p = goalProgress(goal, today)
  const cps = checkpoints(goal, today)
  const periodName = { monthly: t('شهرية', 'monthly'), quarterly: t('ربع سنوية', 'quarterly'), annual: t('سنوية', 'annual') }[goal.period]

  return (
    <>
      <PageHead
        title={goal.title}
        sub={
          goal.scope === 'team'
            ? `${t('هدف جماعي', 'Team goal')} · ${lk.dep(goal.departmentId)}`
            : `${t('هدف فردي', 'Individual goal')} · ${members.map((m) => lk.person(m.id)).join('، ')}`
        }
      >
        {manage && (
          <Button kind="quiet" onClick={() => setEditing(true)}>
            <Pencil size={16} /> {t('تعديل الهدف', 'Edit goal')}
          </Button>
        )}
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="grid content-start gap-5">
          <Sheet>
            <div className="flex flex-wrap items-center gap-3">
              <span className="num text-4xl font-bold">{pct(p)}</span>
              <HealthBadge health={goalHealth(goal, today, db.org.lateThreshold)} />
              <span className="text-sm text-muted">
                {t('المتوقع حتى اليوم', 'Expected by today')} {pct(expectedProgress(goal, today))} · {t('بالوتيرة الحالية يصل إلى', 'At this pace it reaches')} {pct(projectedProgress(goal, today))}
              </span>
            </div>
            <div className="mt-3">
              <Meter value={p} expected={expectedProgress(goal, today)} label={goal.title} />
            </div>
            {goal.description && <p className="mt-4 leading-relaxed">{goal.description}</p>}
          </Sheet>

          <Sheet title={t('مؤشرات الأداء', 'KPIs')}>
            <ul className="grid gap-4">
              {goal.kpis.map((k) => {
                const v = kpiValueAt(k, today)
                return (
                  <li key={k.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b>{k.name}</b>
                      <span className="num text-sm text-muted">
                        {t('الحالي', 'Now')} <b className="text-ink">{num(v)}</b> {k.unit} · {t('البداية', 'from')} {num(k.baseline)} · {t('المستهدف', 'target')} <b className="text-ink">{num(k.target)}</b>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Meter value={kpiProgress(k, today)} label={k.name} />
                      <span className="num w-10 text-end text-sm">{pct(kpiProgress(k, today))}</span>
                      {(mine || manage) && goal.status === 'active' && (
                        <Button kind="quiet" className="min-h-9 shrink-0" onClick={() => setUpdate(k)}>
                          <Plus size={15} /> {t('تحديث', 'Update')}
                        </Button>
                      )}
                    </div>
                    {k.entries.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        {t('آخر تحديث', 'Last update')} {date(k.entries.reduce((a, e) => (e.date > a ? e.date : a), ''))} · {k.entries.length} {t('تحديثاً', 'updates')}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </Sheet>

          <Sheet title={t(`التقسيم (متابعة ${periodName})`, `Breakdown (${periodName} check-ins)`)}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-start font-medium">{t('الفترة', 'Period')}</th>
                    <th className="px-2 py-1.5 text-start font-medium">{t('المتوقع بنهايتها', 'Expected by end')}</th>
                    <th className="px-2 py-1.5 text-start font-medium">{t('المتحقق', 'Achieved')}</th>
                    <th className="px-2 py-1.5 text-start font-medium">{t('الفرق', 'Gap')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cps.map((c) => {
                    const gap = c.actual == null ? null : Math.round((c.actual - c.expected) * 100)
                    const current = c.start <= today && today <= c.end
                    return (
                      <tr key={c.start} className={`border-b border-line/60 last:border-0 ${current ? 'bg-brand-soft/60' : ''}`}>
                        <td className="px-2 py-2">
                          {tl(c.label)} {current && <Pill tone="brand">{t('الحالية', 'Current')}</Pill>}
                        </td>
                        <td className="num px-2">{pct(c.expected)}</td>
                        <td className="num px-2 font-medium">{c.actual == null ? '—' : pct(c.actual)}</td>
                        <td className={`num px-2 ${gap == null ? '' : gap >= -db.org.lateThreshold ? 'text-good' : 'text-late'}`} dir="ltr">
                          {gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Sheet>
        </div>

        <div className="grid content-start gap-5">
          <Sheet title={t('التفاصيل', 'Details')}>
            <dl className="grid gap-2 text-sm">
              <Row k={t('الأهمية', 'Weight')} v={`${goal.weight}%`} />
              <Row k={t('البداية', 'Start')} v={date(goal.start)} />
              <Row k={t('النهاية', 'End')} v={date(goal.end)} />
              <Row k={t('أنشأه', 'Created by')} v={lk.person(goal.createdById)} />
            </dl>
            {members.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <Link key={m.id} to={`/employees/${m.id}`} className="rounded-full bg-sunk px-2 py-0.5 text-xs hover:underline">
                    {lk.person(m.id)}
                  </Link>
                ))}
              </div>
            )}
          </Sheet>
          <Sheet title={t('سجل التعديلات', 'Change log')}>
            {goal.changes.length ? (
              <ol className="grid gap-3 text-sm">
                {[...goal.changes].reverse().map((c, i) => (
                  <li key={i}>
                    <div className="text-xs text-muted">
                      {date(c.at)} · {lk.person(c.byId)}
                    </div>
                    <p>{c.note}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">{t('لم يُعدَّل منذ إنشائه.', 'Unchanged since it was created.')}</p>
            )}
          </Sheet>
        </div>
      </div>

      {editing && <GoalForm goal={goal} onClose={() => setEditing(false)} />}
      {update && (
        <KpiUpdate
          kpi={update}
          onClose={() => setUpdate(null)}
          onSave={(date, value) => {
            save('goals', { ...goal, kpis: goal.kpis.map((k) => (k.id === update.id ? { ...k, entries: [...k.entries.filter((e) => e.date !== date), { date, value, byId: me.id }] } : k)) })
            setUpdate(null)
          }}
        />
      )}
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  )
}

function KpiUpdate({ kpi, onClose, onSave }: { kpi: Kpi; onClose: () => void; onSave: (date: string, value: number) => void }) {
  const { today } = useStore()
  const { t, num } = usePrefs()
  const [d, setD] = useState(today)
  const [v, setV] = useState<number | ''>(kpiValueAt(kpi, today))
  return (
    <Modal title={`${t('تحديث', 'Update')}: ${kpi.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        {t('اكتب القيمة الحالية للمؤشر (وليس الزيادة). المستهدف:', 'Enter the KPI’s current value (not the increase). Target:')} <b className="num text-ink">{num(kpi.target)}</b> {kpi.unit}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('القيمة الحالية', 'Current value')}>
          <NumberInput value={v} onChange={setV} autoFocus />
        </Field>
        <Field label={t('بتاريخ', 'As of')}>
          <Input type="date" value={d} max={today} onChange={(e) => setD(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button kind="quiet" onClick={onClose}>
          {t('إلغاء', 'Cancel')}
        </Button>
        <Button disabled={v === ''} onClick={() => v !== '' && onSave(d, v)}>
          {t('حفظ القيمة', 'Save value')}
        </Button>
      </div>
    </Modal>
  )
}
