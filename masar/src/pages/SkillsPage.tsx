import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { newId, useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { can, canManage, visibleEmployees } from '../domain/access'
import { addDays } from '../domain/dates'
import { levelsAt } from '../domain/skills'
import { SKILL_LEVELS, type SkillLevel } from '../domain/types'
import { Button, Empty, Field, Input, Modal, PageHead, Select, Sheet, Textarea } from '../components/ui'
import { Bars, ChartFrame } from '../components/charts'
import { useLookups } from '../components/lookups'
import { SkillGrowthChart } from './ProfilePage'

export function SkillsPage() {
  const me = useMe()
  const { db, today } = useStore()
  const { t, tl, nm, lang, num } = usePrefs()
  const lk = useLookups()
  const [dep, setDep] = useState('')
  const [assess, setAssess] = useState(false)
  const people = visibleEmployees(me, db.employees.filter((e) => e.active)).filter((e) => !dep || e.departmentId === dep)

  if (me.role === 'employee') {
    const pos = db.positions.find((p) => p.id === me.positionId)
    const ids = [...new Set([...(pos?.requiredSkills.map((s) => s.skillId) ?? []), ...levelsAt(db.skillRecords, me.id).keys()])]
    return (
      <>
        <PageHead title={t('مهاراتي', 'My skills')} sub={t('مستواك في كل مهارة وكيف تطور', 'Your level in each skill and how it grew')} />
        <SkillGrowthChart employeeId={me.id} skillIds={ids} />
        <p className="mt-4 text-sm text-muted">
          {t('تفاصيل أكثر وخطة التطوير في ', 'More detail and a development plan in ')}
          <Link to={`/employees/${me.id}`} className="text-button underline">
            {t('ملفي', 'my profile')}
          </Link>
          {t(' و', ' and ')}
          <Link to="/assistant" className="text-button underline">
            {t('المساعد الذكي', 'the smart assistant')}
          </Link>
          .
        </p>
      </>
    )
  }

  const skillIds = db.skills.map((s) => s.id).filter((sid) => people.some((e) => db.skillRecords.some((r) => r.employeeId === e.id && r.skillId === sid)))
  const yearAgo = addDays(today, -365)
  const avgAt = (sid: string, d: string) => {
    const v = people.map((e) => levelsAt(db.skillRecords, e.id, d).get(sid)).filter((x): x is SkillLevel => x != null)
    return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null
  }
  const compare = skillIds.map((sid) => ({ s: lk.skill(sid), before: avgAt(sid, yearAgo), now: avgAt(sid, today) })).filter((x) => x.now != null)

  return (
    <>
      <PageHead title={t('تتبع المهارات', 'Skill tracking')} sub={t('١ مبتدئ · ٢ متوسط · ٣ متقدم · ٤ خبير', '1 Beginner · 2 Intermediate · 3 Advanced · 4 Expert')}>
        {can(me, 'assess_skills') && (
          <Button onClick={() => setAssess(true)}>
            <Plus size={18} /> {t('تسجيل مستوى مهارة', 'Record a skill level')}
          </Button>
        )}
      </PageHead>
      <div className="mb-4">
        <Select value={dep} onChange={(e) => setDep(e.target.value)} className="w-auto" aria-label={t('القسم', 'Department')}>
          <option value="">{t('كل الأقسام', 'All departments')}</option>
          {db.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {nm(d)}
            </option>
          ))}
        </Select>
      </div>
      <ChartFrame
        title={t('متوسط المستوى: قبل سنة مقابل اليوم', 'Average level: a year ago vs. today')}
        head={[t('المهارة', 'Skill'), t('قبل سنة', 'A year ago'), t('اليوم', 'Today')]}
        rows={compare.map((c) => [c.s, c.before == null ? '—' : num(c.before), num(c.now!)])}
      >
        <Bars
          data={compare}
          x="s"
          unit=""
          domain={[0, 4]}
          rtl={lang === 'ar'}
          horizontal
          series={[
            { key: 'before', name: t('قبل سنة', 'A year ago'), color: 'var(--s2)' },
            { key: 'now', name: t('اليوم', 'Today'), color: 'var(--s1)' },
          ]}
        />
      </ChartFrame>
      <Sheet title={t('مصفوفة المهارات', 'Skill matrix')} className="mt-5">
        {people.length && skillIds.length ? (
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="sticky start-0 bg-card px-2 py-2 text-start font-medium text-muted">{t('الموظف', 'Employee')}</th>
                  {skillIds.map((sid) => (
                    <th key={sid} className="min-w-24 px-1 py-2 text-center text-xs font-medium text-muted">
                      {lk.skill(sid)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((e) => {
                  const lv = levelsAt(db.skillRecords, e.id, today)
                  const req = new Map(db.positions.find((p) => p.id === e.positionId)?.requiredSkills.map((r) => [r.skillId, r.level]) ?? [])
                  return (
                    <tr key={e.id} className="border-t border-line">
                      <td className="sticky start-0 bg-card px-2 py-2 whitespace-nowrap">
                        <Link to={`/employees/${e.id}`} className="font-medium hover:underline">
                          {nm(e)}
                        </Link>
                      </td>
                      {skillIds.map((sid) => {
                        const v = lv.get(sid)
                        const r = req.get(sid)
                        return (
                          <td key={sid} className="px-1 py-2 text-center" title={v ? `${tl(SKILL_LEVELS[v])}${r ? ` / ${t('المطلوب', 'needed')} ${tl(SKILL_LEVELS[r])}` : ''}` : undefined}>
                            {v ? (
                              <span className="inline-flex flex-col items-center gap-0.5">
                                <span className="flex gap-[2px]" aria-hidden>
                                  {[1, 2, 3, 4].map((n) => (
                                    <span key={n} className={`h-3 w-2.5 rounded-[2px] ${n <= v ? 'bg-track' : 'bg-track-empty'}`} />
                                  ))}
                                </span>
                                <span className={`text-[0.7rem] ${r && v < r ? 'font-bold text-late' : 'text-muted'}`}>
                                  {tl(SKILL_LEVELS[v])}
                                  {r && v < r ? ' ↓' : ''}
                                </span>
                              </span>
                            ) : (
                              <span className="text-muted">·</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{t('↓ بالأحمر = أقل من المستوى المطلوب لمنصبه', '↓ in red = below the level the position needs')}</p>
          </div>
        ) : (
          <Empty>{t('لا مستويات مسجلة بعد.', 'No levels recorded yet.')}</Empty>
        )}
      </Sheet>
      {assess && <SkillAssessForm onClose={() => setAssess(false)} />}
    </>
  )
}

export function SkillAssessForm({ employeeId, onClose }: { employeeId?: string; onClose: () => void }) {
  const me = useMe()
  const { db, today, save } = useStore()
  const { t, tl, nm } = usePrefs()
  const people = db.employees.filter((e) => e.active && canManage(me, e, db.employees))
  const [emp, setEmp] = useState(employeeId ?? people[0]?.id ?? '')
  const [skill, setSkill] = useState('')
  const [level, setLevel] = useState<SkillLevel>(2)
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const current = skill ? levelsAt(db.skillRecords, emp, today).get(skill) : undefined
  return (
    <Modal title={t('تسجيل مستوى مهارة', 'Record a skill level')} onClose={onClose}>
      <div className="grid gap-3">
        {!employeeId && (
          <Field label={t('الموظف', 'Employee')}>
            <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
              {people.map((e) => (
                <option key={e.id} value={e.id}>
                  {nm(e)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('المهارة', 'Skill')} hint={current ? `${t('المستوى الحالي:', 'Current level:')} ${tl(SKILL_LEVELS[current])}` : undefined}>
          <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">—</option>
            {db.skills.map((s) => (
              <option key={s.id} value={s.id}>
                {nm(s)}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-muted">{t('المستوى', 'Level')}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([1, 2, 3, 4] as SkillLevel[]).map((lv) => (
              <button key={lv} type="button" aria-pressed={level === lv} onClick={() => setLevel(lv)} className={`min-h-11 rounded-lg border ${level === lv ? 'border-button bg-button text-on-brand' : 'border-line hover:bg-brand-soft'}`}>
                {tl(SKILL_LEVELS[lv])}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={t('التاريخ', 'Date')}>
          <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('ملاحظة (اختياري)', 'Note (optional)')}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button kind="quiet" onClick={onClose}>
          {t('إلغاء', 'Cancel')}
        </Button>
        <Button
          disabled={!emp || !skill}
          onClick={() => {
            save('skillRecords', { id: newId(), orgId: db.org.id, employeeId: emp, skillId: skill, level, date, byId: me.id, note })
            onClose()
          }}
        >
          {t('حفظ المستوى', 'Save level')}
        </Button>
      </div>
    </Modal>
  )
}
