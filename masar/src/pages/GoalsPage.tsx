import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { can, visibleEmployees } from '../domain/access'
import { goalHealth, goalProgress, goalsOf, type Health } from '../domain/goals'
import type { Goal } from '../domain/types'
import { Button, Empty, HealthBadge, Meter, PageHead, Segmented, Select } from '../components/ui'
import { useLookups } from '../components/lookups'
import { GoalForm } from './GoalForm'
import { expectedProgress } from '../domain/goals'

export function GoalsPage() {
  const me = useMe()
  const { db, today } = useStore()
  const { t, nm, pct } = usePrefs()
  const lk = useLookups()
  const [scope, setScope] = useState<'all' | Goal['scope']>('all')
  const [health, setHealth] = useState<'' | Health>('')
  const [dep, setDep] = useState('')
  const [adding, setAdding] = useState(false)
  const map = new Map<string, Goal>()
  for (const e of visibleEmployees(me, db.employees)) for (const g of goalsOf(db.goals, e)) map.set(g.id, g)
  if (me.role === 'admin' || me.role === 'hr') for (const g of db.goals) map.set(g.id, g)
  const goals = [...map.values()]
    .filter((g) => scope === 'all' || g.scope === scope)
    .filter((g) => !dep || g.departmentId === dep)
    .filter((g) => !health || goalHealth(g, today, db.org.lateThreshold) === health)
    .sort((a, b) => goalProgress(a, today) - expectedProgress(a, today) - (goalProgress(b, today) - expectedProgress(b, today)))

  const owner = (g: Goal) =>
    g.scope === 'team' ? `${t('فريق', 'Team')} ${lk.dep(g.departmentId)}${g.employeeIds.length ? ` (${g.employeeIds.length})` : ''}` : g.employeeIds.map((id) => lk.person(id)).join('، ')

  return (
    <>
      <PageHead title={t('الأهداف', 'Goals')} sub={t('مرتبة من الأكثر تأخراً عن المتوقع', 'Sorted from furthest behind schedule')}>
        {can(me, 'manage_goals') && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} /> {t('هدف جديد', 'New goal')}
          </Button>
        )}
      </PageHead>
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented
          label={t('النوع', 'Type')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: t('الكل', 'All') },
            { value: 'individual', label: t('فردية', 'Individual') },
            { value: 'team', label: t('جماعية', 'Team') },
          ]}
        />
        <Select value={health} onChange={(e) => setHealth(e.target.value as Health | '')} className="w-auto" aria-label={t('الحالة', 'Status')}>
          <option value="">{t('كل الحالات', 'All statuses')}</option>
          <option value="late">{t('متأخر', 'Behind')}</option>
          <option value="at_risk">{t('يحتاج متابعة', 'At risk')}</option>
          <option value="on_track">{t('على المسار', 'On track')}</option>
          <option value="done">{t('مكتمل', 'Done')}</option>
        </Select>
        {me.role !== 'employee' && (
          <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto" aria-label={t('القسم', 'Department')}>
            <option value="">{t('كل الأقسام', 'All departments')}</option>
            {db.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {nm(d)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {goals.length ? (
        <ul className="grid gap-2">
          {goals.map((g) => {
            const p = goalProgress(g, today)
            return (
              <li key={g.id}>
                <Link to={`/goals/${g.id}`} className="grid gap-2 rounded-xl border border-line bg-card p-3 hover:border-button sm:grid-cols-[1fr_12rem_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block font-medium">{g.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {owner(g)} · {t('الوزن', 'Weight')} {g.weight}%
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Meter value={p} expected={expectedProgress(g, today)} label={g.title} />
                    <span className="num w-10 text-end text-sm font-bold">{pct(p)}</span>
                  </span>
                  <HealthBadge health={goalHealth(g, today, db.org.lateThreshold)} />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>{t('لا أهداف بهذه الفلاتر.', 'No goals match these filters.')}</Empty>
      )}
      {adding && <GoalForm goal={null} onClose={() => setAdding(false)} />}
    </>
  )
}
