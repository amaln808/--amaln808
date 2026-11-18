import { useRef, useState } from 'react'
import { Copy, FileDown, Plus, ShieldCheck } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { canManage, visibleEmployees } from '../domain/access'
import { analyze, annualSummary, skillPlan, suggestGoals, type GoalIdea } from '../domain/insights'
import { SKILL_LEVELS, type Employee } from '../domain/types'
import { Button, Empty, PageHead, Pill, Select, Sheet } from '../components/ui'
import { useLookups } from '../components/lookups'
import { GoalForm } from './GoalForm'
import { downloadPdf } from '../export/files'

export function AssistantPage() {
  const me = useMe()
  const { db } = useStore()
  const { t, nm } = usePrefs()
  const people = visibleEmployees(me, db.employees.filter((e) => e.active))
  const [id, setId] = useState(me.role === 'employee' ? me.id : (people.find((p) => p.id !== me.id)?.id ?? me.id))
  const emp = people.find((p) => p.id === id) ?? me
  return (
    <>
      <PageHead title={t('المساعد الذكي', 'Smart assistant')} sub={t('اقتراحات أهداف، خطط تطوير، تحليل وتوصيات، وملخص سنوي', 'Goal ideas, development plans, analysis and an annual summary')}>
        {people.length > 1 && (
          <Select value={emp.id} onChange={(e) => setId(e.target.value)} className="w-auto" aria-label={t('الموظف', 'Employee')}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {nm(p)}
              </option>
            ))}
          </Select>
        )}
      </PageHead>
      <p className="mb-5 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
        <ShieldCheck size={17} className="mt-0.5 shrink-0" />
        {t(
          'التحليل يتم داخل التطبيق بقواعد واضحة من بيانات الشركة نفسها، ولا تُرسل بيانات الموظفين لأي جهة. يمكن لاحقاً إضافة نموذج ذكاء اصطناعي متقدم.',
          'Analysis runs inside the app using clear rules over the company’s own data; no employee data is sent anywhere. An advanced AI model can be added later.',
        )}
      </p>
      <div className="grid gap-5">
        <GoalIdeas emp={emp} />
        <Plan emp={emp} />
        <SummaryPanel employee={emp} />
      </div>
    </>
  )
}

function GoalIdeas({ emp }: { emp: Employee }) {
  const me = useMe()
  const { db, today } = useStore()
  const { t, tl, nm, num } = usePrefs()
  const [idea, setIdea] = useState<GoalIdea | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const ideas = suggestGoals(db, emp, today).filter((i) => !added.includes(i.title.ar))
  const may = canManage(me, emp, db.employees)
  return (
    <Sheet title={t(`أهداف مقترحة لـ ${nm(emp)}`, `Suggested goals for ${nm(emp)}`)}>
      {ideas.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {ideas.map((i) => (
            <li key={i.title.ar} className="flex flex-col rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <b>{tl(i.title)}</b>
                <Pill>{t('وزن', 'weight')} {i.weight}%</Pill>
              </div>
              <p className="mt-1 text-sm text-muted">{tl(i.description)}</p>
              <ul className="mt-2 text-sm">
                {i.kpis.map((k) => (
                  <li key={k.name.ar} className="num">
                    {tl(k.name)}: {num(k.baseline)} ← {num(k.target)} {tl(k.unit)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">{tl(i.why)}</p>
              {may && (
                <Button kind="quiet" className="mt-3 min-h-9 self-start" onClick={() => setIdea(i)}>
                  <Plus size={15} /> {t('مراجعة وإضافة', 'Review & add')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('لا اقتراحات جديدة: كل الأهداف المناسبة لوظيفته موجودة.', 'No new ideas: every fitting goal for the role is already set.')}</Empty>
      )}
      {idea && <GoalForm goal={null} idea={idea} presetEmployeeId={emp.id} onClose={() => setIdea(null)} onSaved={() => setAdded([...added, idea.title.ar])} />}
    </Sheet>
  )
}

function Plan({ emp }: { emp: Employee }) {
  const { db, today } = useStore()
  const { t, tl } = usePrefs()
  const lk = useLookups()
  const steps = skillPlan(db, emp, today)
  const weeks = steps.reduce((s, x) => s + x.weeks, 0)
  return (
    <Sheet title={t('خطة تطوير المهارات', 'Skill development plan')} action={steps.length > 0 && <span className="text-sm text-muted">{t(`نحو ${weeks} أسبوعاً`, `about ${weeks} weeks`)}</span>}>
      {steps.length ? (
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={i} className="grid gap-1 border-s-4 ps-3" style={{ borderColor: s.priority === 'high' ? 'var(--late)' : s.priority === 'medium' ? 'var(--warn)' : 'var(--line)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <b>{lk.skill(s.skillId)}</b>
                <span className="text-sm text-muted">
                  {s.from ? tl(SKILL_LEVELS[s.from]) : t('بلا تقييم', 'unassessed')} ← {tl(SKILL_LEVELS[s.to])}
                </span>
                <Pill tone={s.priority === 'high' ? 'late' : s.priority === 'medium' ? 'warn' : 'muted'}>
                  {s.priority === 'high' ? t('أولوية عالية', 'High priority') : s.priority === 'medium' ? t('أولوية متوسطة', 'Medium priority') : t('تطوير إضافي', 'Stretch')}
                </Pill>
                <span className="num text-xs text-muted">{t(`${s.weeks} أسابيع`, `${s.weeks} weeks`)}</span>
              </div>
              <ul className="list-disc ps-5 text-sm">
                {s.actions.map((a, j) => (
                  <li key={j}>{tl(a)}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>{t('لا فجوات في مهارات المنصب.', 'No gaps against the position’s skills.')}</Empty>
      )}
    </Sheet>
  )
}

/** Analysis + annual summary for one employee; also shown in the profile */
export function SummaryPanel({ employee }: { employee: Employee }) {
  const { db, today } = useStore()
  const { t, tl, lang } = usePrefs()
  const thisYear = Number(today.slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const a = analyze(db, employee, today)
  const summary = tl(annualSummary(db, employee, year, today))
  return (
    <Sheet
      title={t('الملخص السنوي والتحليل', 'Annual summary & analysis')}
      action={
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-9 w-auto" aria-label={t('السنة', 'Year')}>
          {[thisYear, thisYear - 1].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      }
    >
      <div ref={box} className="bg-card p-1" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <p className="leading-loose">{summary}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-bold text-muted">{t('نقاط القوة', 'Strengths')}</h3>
            <div className="flex flex-wrap gap-1.5">{a.strengths.length ? a.strengths.map((s) => <Pill key={s.key} tone="good">{tl(s.label)} {s.value}%</Pill>) : '—'}</div>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-bold text-muted">{t('مجالات التطوير', 'Areas to develop')}</h3>
            <div className="flex flex-wrap gap-1.5">{a.weaknesses.length ? a.weaknesses.map((s) => <Pill key={s.key} tone="warn">{tl(s.label)} {s.value}%</Pill>) : '—'}</div>
          </div>
        </div>
        <h3 className="mt-4 mb-1 text-sm font-bold text-muted">{t('التوصيات', 'Recommendations')}</h3>
        <ul className="grid list-disc gap-1 ps-5 text-sm">
          {a.recommendations.map((r, i) => (
            <li key={i}>{tl(r)}</li>
          ))}
        </ul>
      </div>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <Button
          kind="quiet"
          onClick={async () => {
            await navigator.clipboard?.writeText(summary)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          <Copy size={16} /> {copied ? t('نُسخ', 'Copied') : t('نسخ الملخص', 'Copy summary')}
        </Button>
        <Button kind="quiet" onClick={() => box.current && downloadPdf(box.current, `summary-${(employee.nameEn || employee.id).replace(/\s+/g, '-')}-${year}.pdf`)}>
          <FileDown size={16} /> PDF
        </Button>
      </div>
    </Sheet>
  )
}
