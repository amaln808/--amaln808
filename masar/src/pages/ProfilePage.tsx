import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Mail, Pencil, Phone, Plus } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { can, canManage, visibleEmployees } from '../domain/access'
import { goalHealth, goalProgress, goalsOf } from '../domain/goals'
import { reviewHistory } from '../domain/reviews'
import { levelsAt, skillHistory } from '../domain/skills'
import { yearsBetween } from '../domain/dates'
import { SKILL_LEVELS } from '../domain/types'
import { Avatar, Button, Empty, HealthBadge, PageHead, Pill, Segmented, Sheet } from '../components/ui'
import { Track } from '../components/Track'
import { ChartFrame, Lines, SERIES } from '../components/charts'
import { useLookups } from '../components/lookups'
import { EmployeeForm } from './EmployeesPage'
import { GoalForm } from './GoalForm'
import { SkillAssessForm } from './SkillsPage'
import { SummaryPanel } from './AssistantPage'

type Tab = 'goals' | 'reviews' | 'skills' | 'summary'

export function ProfilePage() {
  const { id } = useParams()
  const me = useMe()
  const { db, today } = useStore()
  const { t, tl, nm, pct, lang, date } = usePrefs()
  const lk = useLookups()
  const [tab, setTab] = useState<Tab>('goals')
  const [editing, setEditing] = useState(false)
  const [newGoal, setNewGoal] = useState(false)
  const [assess, setAssess] = useState(false)
  const emp = db.employees.find((e) => e.id === id)
  if (!emp || !visibleEmployees(me, db.employees).some((e) => e.id === emp.id)) return <Navigate to="/" />

  const manage = canManage(me, emp, db.employees)
  const goals = goalsOf(db.goals, emp)
  const hist = reviewHistory(emp.id, db.reviews, db.cycles, db.org.criteria, db.org.scale)
  const tenure = yearsBetween(emp.hireDate, today)
  const pos = db.positions.find((p) => p.id === emp.positionId)
  const levels = levelsAt(db.skillRecords, emp.id, today)
  const skillIds = [...new Set([...(pos?.requiredSkills.map((s) => s.skillId) ?? []), ...levels.keys()])]
  const rtl = lang === 'ar'

  return (
    <>
      <PageHead title={nm(emp)} sub={`${lk.pos(emp.positionId)} · ${lk.dep(emp.departmentId)}`}>
        {can(me, 'manage_employees') && (
          <Button kind="quiet" onClick={() => setEditing(true)}>
            <Pencil size={16} /> {t('تعديل', 'Edit')}
          </Button>
        )}
      </PageHead>

      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <Sheet>
          <div className="flex items-center gap-3">
            <Avatar name={emp.name} size={64} />
            <div>
              {!emp.active && <Pill>{t('موقوف', 'Inactive')}</Pill>}
              <div className="text-sm text-muted">{t('المدير المباشر', 'Line manager')}</div>
              {emp.managerId ? (
                <Link to={`/employees/${emp.managerId}`} className="font-medium hover:underline">
                  {lk.person(emp.managerId)}
                </Link>
              ) : (
                '—'
              )}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
            <div>
              <dt className="text-muted">{t('تاريخ التعيين', 'Hired')}</dt>
              <dd className="num">{date(emp.hireDate)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('في الشركة', 'At company')}</dt>
              <dd className="num">{t(`${tenure} سنة`, `${tenure} yrs`)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">{t('سنوات الخبرة الكلية', 'Total experience')}</dt>
              <dd className="num text-lg font-bold">
                {t(`${(emp.priorExperienceYears + tenure).toFixed(1)} سنة`, `${(emp.priorExperienceYears + tenure).toFixed(1)} years`)}
                <span className="ms-1 text-xs font-normal text-muted">{t(`(منها ${emp.priorExperienceYears} قبل الانضمام)`, `(${emp.priorExperienceYears} before joining)`)}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-4 grid gap-1 text-sm">
            {emp.email && (
              <a href={`mailto:${emp.email}`} className="flex min-h-10 items-center gap-2 text-button hover:underline" dir="ltr">
                <Mail size={15} /> {emp.email}
              </a>
            )}
            {emp.phone && (
              <a href={`tel:${emp.phone}`} className="flex min-h-10 items-center gap-2 text-button hover:underline" dir="ltr">
                <Phone size={15} /> {emp.phone}
              </a>
            )}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-sm text-muted">{t('المهارات الحالية', 'Current skills')}</div>
            <div className="flex flex-wrap gap-1.5">
              {[...levels].map(([sid, lv]) => (
                <Pill key={sid} tone="brand">
                  {lk.skill(sid)} · {tl(SKILL_LEVELS[lv])}
                </Pill>
              ))}
              {!levels.size && <span className="text-sm text-muted">—</span>}
            </div>
          </div>
        </Sheet>

        <div className="min-w-0">
          <Sheet>
            <Track goals={goals} today={today} />
          </Sheet>
          <div className="my-4">
            <Segmented<Tab>
              label={t('الأقسام', 'Sections')}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'goals', label: t('الأهداف', 'Goals') },
                { value: 'reviews', label: t('التقييمات', 'Reviews') },
                { value: 'skills', label: t('تطور المهارات', 'Skill growth') },
                { value: 'summary', label: t('الملخص الذكي', 'Smart summary') },
              ]}
            />
          </div>

          {tab === 'goals' && (
            <Sheet
              title={t('الأهداف', 'Goals')}
              action={
                manage && (
                  <Button kind="quiet" onClick={() => setNewGoal(true)} className="min-h-9">
                    <Plus size={16} /> {t('هدف جديد', 'New goal')}
                  </Button>
                )
              }
            >
              {goals.length ? (
                <ul className="divide-y divide-line">
                  {goals.map((g) => (
                    <li key={g.id}>
                      <Link to={`/goals/${g.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:text-button">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{g.title}</span>
                          <span className="block text-xs text-muted">
                            {g.scope === 'team' ? t('جماعي', 'Team') : t('فردي', 'Individual')} · {t('الوزن', 'Weight')} {g.weight}% · {date(g.end)}
                          </span>
                        </span>
                        <span className="num font-bold">{pct(goalProgress(g, today))}</span>
                        <HealthBadge health={goalHealth(g, today, db.org.lateThreshold)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t('لا أهداف بعد.', 'No goals yet.')}</Empty>
              )}
            </Sheet>
          )}

          {tab === 'reviews' && (
            <div className="grid gap-5">
              <ChartFrame
                title={t('نتيجة التقييم عبر الدورات', 'Review result across cycles')}
                head={[t('الدورة', 'Cycle'), t('النتيجة', 'Result')]}
                rows={hist.map((h) => [lk.cycle(h.cycle.id), `${h.percent}%`])}
              >
                <Lines data={hist.map((h) => ({ c: lk.cycle(h.cycle.id), v: h.percent }))} x="c" rtl={rtl} series={[{ key: 'v', name: t('النتيجة', 'Result'), color: 'var(--s1)' }]} />
              </ChartFrame>
              <Sheet title={t('سجل التقييمات', 'Review history')}>
                {hist.length ? (
                  <ul className="divide-y divide-line">
                    {[...hist].reverse().map((h) => (
                      <li key={h.cycle.id} className="py-3">
                        <div className="flex justify-between gap-2">
                          <b>{lk.cycle(h.cycle.id)}</b>
                          <b className="num">{h.percent}%</b>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {db.org.criteria.map((c) => (
                            <Pill key={c.key}>
                              {lang === 'ar' ? c.ar : c.en} <b className="num text-ink">{h.review.scores[c.key] ?? '—'}</b>
                            </Pill>
                          ))}
                        </div>
                        {h.review.managerNotes && <p className="mt-2 text-sm"><span className="text-muted">{t('ملاحظات المدير: ', 'Manager: ')}</span>{h.review.managerNotes}</p>}
                        {h.review.selfNotes && <p className="mt-1 text-sm"><span className="text-muted">{t('ملاحظات الموظف: ', 'Employee: ')}</span>{h.review.selfNotes}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>{t('لا تقييمات مكتملة بعد.', 'No completed reviews yet.')}</Empty>
                )}
              </Sheet>
            </div>
          )}

          {tab === 'skills' && (
            <div className="grid gap-5">
              <SkillGrowthChart employeeId={emp.id} skillIds={skillIds} />
              <Sheet
                title={t('المهارات مقابل متطلبات المنصب', 'Skills vs. the position’s needs')}
                action={
                  manage && (
                    <Button kind="quiet" onClick={() => setAssess(true)} className="min-h-9">
                      <Plus size={16} /> {t('تسجيل مستوى', 'Record a level')}
                    </Button>
                  )
                }
              >
                <ul className="grid gap-3">
                  {skillIds.map((sid) => {
                    const cur = levels.get(sid) ?? 0
                    const req = pos?.requiredSkills.find((s) => s.skillId === sid)?.level
                    return (
                      <li key={sid} className="grid grid-cols-[9rem_1fr] items-center gap-3 text-sm">
                        <span className="font-medium">{lk.skill(sid)}</span>
                        <div>
                          <div className="flex gap-[2px]" role="img" aria-label={`${cur ? tl(SKILL_LEVELS[cur]) : '—'}${req ? ` / ${tl(SKILL_LEVELS[req])}` : ''}`}>
                            {[1, 2, 3, 4].map((lv) => (
                              <span key={lv} className={`h-3 flex-1 rounded-[3px] ${lv <= cur ? 'bg-track' : 'bg-track-empty'} ${req === lv ? 'outline outline-2 outline-offset-1 outline-ink' : ''}`} />
                            ))}
                          </div>
                          <div className="mt-1 flex justify-between text-xs text-muted">
                            <span>{cur ? tl(SKILL_LEVELS[cur]) : t('غير مقيّم', 'Not assessed')}</span>
                            {req && <span>{t('المطلوب: ', 'Needed: ')}{tl(SKILL_LEVELS[req])}{cur >= req ? ' ✓' : ''}</span>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Sheet>
            </div>
          )}

          {tab === 'summary' && <SummaryPanel employee={emp} />}
        </div>
      </div>
      {editing && <EmployeeForm employee={emp} onClose={() => setEditing(false)} />}
      {newGoal && <GoalForm goal={null} presetEmployeeId={emp.id} onClose={() => setNewGoal(false)} />}
      {assess && <SkillAssessForm employeeId={emp.id} onClose={() => setAssess(false)} />}
    </>
  )
}

/** Skill levels over time; up to six skills as lines (more would need folding), all in the table view */
export function SkillGrowthChart({ employeeId, skillIds }: { employeeId: string; skillIds: string[] }) {
  const { db } = useStore()
  const { t, tl, lang, date } = usePrefs()
  const lk = useLookups()
  const shown = skillIds.slice(0, 6)
  const dates = [...new Set(db.skillRecords.filter((r) => r.employeeId === employeeId).map((r) => r.date))].sort()
  const data = dates.map((d) => {
    const lv = levelsAt(db.skillRecords, employeeId, d)
    return { d: date(d), ...Object.fromEntries(shown.map((s) => [s, lv.get(s) ?? null])) }
  })
  const rows = skillIds.map((s) => [lk.skill(s), skillHistory(db.skillRecords, employeeId, s).map((h) => `${date(h.date)}: ${tl(SKILL_LEVELS[h.level])}`).join(' ← ') || '—'])
  if (!dates.length) return <Empty>{t('لم تُسجَّل مستويات مهارات بعد.', 'No skill levels recorded yet.')}</Empty>
  return (
    <ChartFrame
      title={t('النمو المهاري', 'Skill growth')}
      note={t('1 مبتدئ · 2 متوسط · 3 متقدم · 4 خبير', '1 Beginner · 2 Intermediate · 3 Advanced · 4 Expert')}
      head={[t('المهارة', 'Skill'), t('التطور', 'History')]}
      rows={rows}
    >
      <Lines data={data} x="d" unit="" domain={[0, 4]} rtl={lang === 'ar'} series={shown.map((s, i) => ({ key: s, name: lk.skill(s), color: SERIES[i] }))} />
    </ChartFrame>
  )
}
