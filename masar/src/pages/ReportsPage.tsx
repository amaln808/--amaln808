import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileDown, FileSpreadsheet } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { visibleEmployees } from '../domain/access'
import { goalHealth, goalsOf, weightedAchievement } from '../domain/goals'
import { reviewHistory } from '../domain/reviews'
import { analyze } from '../domain/insights'
import { Button, Empty, PageHead, Select, Sheet } from '../components/ui'
import { Bars, ChartFrame } from '../components/charts'
import { useLookups } from '../components/lookups'
import { buildWorkbook, downloadPdf, downloadWorkbook } from '../export/files'

export function ReportsPage() {
  const me = useMe()
  const { db, today } = useStore()
  const { t, tl, nm, pct, lang, num } = usePrefs()
  const lk = useLookups()
  const people = visibleEmployees(me, db.employees.filter((e) => e.active)).filter((e) => me.role !== 'manager' || e.id !== me.id)
  const [empId, setEmpId] = useState(people[0]?.id ?? '')
  const emp = people.find((e) => e.id === empId) ?? people[0]
  const hist = emp ? reviewHistory(emp.id, db.reviews, db.cycles, db.org.criteria, db.org.scale) : []
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const from = hist.find((h) => h.cycle.id === fromId) ?? hist.at(-2)
  const to = hist.find((h) => h.cycle.id === toId) ?? hist.at(-1)
  const report = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const rtl = lang === 'ar'
  if (!emp) return <Empty>{t('لا يوجد موظفون في نطاقك.', 'No one in your scope.')}</Empty>

  const a = analyze(db, emp, today)
  const compare = db.org.criteria.map((c) => ({ c: lang === 'ar' ? c.ar : c.en, from: from?.review.scores[c.key] ?? null, to: to?.review.scores[c.key] ?? null }))

  // Goal achievement by department (people in scope)
  const deps = db.departments
    .map((d) => {
      const ps = people.filter((p) => p.departmentId === d.id)
      const v = ps.map((p) => weightedAchievement(goalsOf(db.goals, p), today)).filter((x): x is number => x != null)
      const gs = [...new Map(ps.flatMap((p) => goalsOf(db.goals, p)).map((g) => [g.id, g])).values()]
      const ok = gs.filter((g) => ['done', 'on_track'].includes(goalHealth(g, today, db.org.lateThreshold))).length
      return { d: nm(d), n: ps.length, ach: v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) : null, ok, total: gs.length }
    })
    .filter((x) => x.n > 0)

  const exportPdf = async () => {
    if (!report.current) return
    setBusy(true)
    try {
      await downloadPdf(report.current, `report-${(emp.nameEn || emp.id).replace(/\s+/g, '-')}-${today}.pdf`)
    } finally {
      setBusy(false)
    }
  }
  const exportExcel = async () => {
    setBusy(true)
    try {
      await downloadWorkbook(buildWorkbook(db, me, today, lang), `masar-${today}.xlsx`, rtl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title={t('التقارير والتحليلات', 'Reports & analytics')}>
        <Button kind="quiet" onClick={exportExcel} disabled={busy}>
          <FileSpreadsheet size={17} /> {t('تصدير Excel (كل الموظفين)', 'Export Excel (everyone)')}
        </Button>
        <Button onClick={exportPdf} disabled={busy}>
          <FileDown size={17} /> {t('تقرير الموظف PDF', 'Employee report PDF')}
        </Button>
      </PageHead>

      <ChartFrame
        title={t('إنجاز الأهداف حسب القسم', 'Goal achievement by department')}
        head={[t('القسم', 'Department'), t('الموظفون', 'People'), t('متوسط الإنجاز', 'Avg achievement'), t('أهداف على المسار', 'Goals on track')]}
        rows={deps.map((d) => [d.d, d.n, d.ach == null ? '—' : `${d.ach}%`, `${d.ok}/${d.total}`])}
      >
        <Bars data={deps} x="d" rtl={rtl} series={[{ key: 'ach', name: t('متوسط الإنجاز', 'Avg achievement'), color: 'var(--s1)' }]} />
      </ChartFrame>

      <div className="no-print mt-6 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm text-muted">
          {t('الموظف', 'Employee')}
          <Select value={emp.id} onChange={(e) => (setEmpId(e.target.value), setFromId(''), setToId(''))} className="w-auto">
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {nm(p)}
              </option>
            ))}
          </Select>
        </label>
        {hist.length > 1 && (
          <>
            <label className="grid gap-1 text-sm text-muted">
              {t('مقارنة الفترة', 'Compare')}
              <Select value={from?.cycle.id} onChange={(e) => setFromId(e.target.value)} className="w-auto">
                {hist.map((h) => (
                  <option key={h.cycle.id} value={h.cycle.id}>
                    {lk.cycle(h.cycle.id)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm text-muted">
              {t('مع', 'with')}
              <Select value={to?.cycle.id} onChange={(e) => setToId(e.target.value)} className="w-auto">
                {hist.map((h) => (
                  <option key={h.cycle.id} value={h.cycle.id}>
                    {lk.cycle(h.cycle.id)}
                  </option>
                ))}
              </Select>
            </label>
          </>
        )}
      </div>

      <div ref={report} className="mt-4 grid gap-5 bg-ground" dir={rtl ? 'rtl' : 'ltr'}>
        <Sheet>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">
                <Link to={`/employees/${emp.id}`} className="hover:underline">
                  {nm(emp)}
                </Link>
              </h2>
              <p className="text-muted">
                {lk.pos(emp.positionId)} · {lk.dep(emp.departmentId)} · {nm(db.org)}
              </p>
            </div>
            <div className="text-sm text-muted">{today}</div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fig k={t('آخر تقييم', 'Latest review')} v={a.latest == null ? '—' : `${a.latest}%`} />
            <Fig k={t('التغير عن السابق', 'Change from previous')} v={a.change == null ? '—' : `${a.change > 0 ? '+' : ''}${a.change}`} />
            <Fig k={t('نسبة تحقيق الأهداف', 'Goal achievement')} v={pct(a.goalAchievement)} />
            <Fig k={t('التوقع للتقييم القادم', 'Next review forecast')} v={a.forecast ? `${a.forecast.value}%` : '—'} note={a.forecast ? `${a.forecast.low}–${a.forecast.high}%` : undefined} />
          </dl>
        </Sheet>

        {from && to && from.cycle.id !== to.cycle.id ? (
          <ChartFrame
            title={t(`المقارنة: ${lk.cycle(from.cycle.id)} مقابل ${lk.cycle(to.cycle.id)}`, `Comparison: ${lk.cycle(from.cycle.id)} vs ${lk.cycle(to.cycle.id)}`)}
            note={t(`النتيجة ${from.percent}% ← ${to.percent}%`, `Result ${from.percent}% → ${to.percent}%`)}
            head={[t('العنصر', 'Item'), lk.cycle(from.cycle.id), lk.cycle(to.cycle.id), t('الفرق', 'Change')]}
            rows={compare.map((c) => [c.c, c.from ?? '—', c.to ?? '—', c.from != null && c.to != null ? `${c.to - c.from > 0 ? '+' : ''}${c.to - c.from}` : '—'])}
          >
            <Bars
              data={compare}
              x="c"
              unit=""
              domain={[0, db.org.scale]}
              rtl={rtl}
              horizontal
              series={[
                { key: 'from', name: lk.cycle(from.cycle.id), color: 'var(--s2)' },
                { key: 'to', name: lk.cycle(to.cycle.id), color: 'var(--s1)' },
              ]}
            />
          </ChartFrame>
        ) : (
          <Empty>{t('يلزم تقييمان مكتملان على الأقل للمقارنة.', 'Two completed reviews are needed to compare.')}</Empty>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <Sheet title={t('نقاط القوة', 'Strengths')}>
            <ScoreList items={a.strengths.map((s) => [tl(s.label), s.value])} empty={t('لا بيانات كافية', 'Not enough data')} />
          </Sheet>
          <Sheet title={t('مجالات التطوير', 'Areas to develop')}>
            <ScoreList items={a.weaknesses.map((s) => [tl(s.label), s.value])} empty={t('لا نقاط ضعف بارزة', 'No notable weaknesses')} />
          </Sheet>
        </div>
        <Sheet title={t('التوقع والتوصيات', 'Forecast & recommendations')}>
          {a.forecast && (
            <p className="mb-3">
              {t(
                `بناءً على ${a.forecast.basis} تقييمات سابقة، الاتجاه ${a.forecast.trend === 'up' ? 'صاعد' : a.forecast.trend === 'down' ? 'هابط' : 'مستقر'} (${num(a.forecast.slope)} نقطة لكل تقييم)، والنتيجة المتوقعة في التقييم القادم نحو ${a.forecast.value}% وغالباً بين ${a.forecast.low}% و${a.forecast.high}%.`,
                `From ${a.forecast.basis} past reviews the trend is ${a.forecast.trend} (${num(a.forecast.slope)} points per review); the next review is expected near ${a.forecast.value}%, most likely between ${a.forecast.low}% and ${a.forecast.high}%.`,
              )}
            </p>
          )}
          <ul className="grid list-disc gap-1.5 ps-5">
            {a.recommendations.map((r, i) => (
              <li key={i}>{tl(r)}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{t('التوقع تقدير إحصائي من الاتجاه السابق، وليس حكماً على الموظف.', 'The forecast is a statistical estimate from past trend, not a judgement of the person.')}</p>
        </Sheet>
      </div>
    </>
  )
}

function Fig({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{k}</dt>
      <dd className="num text-2xl font-bold">{v}</dd>
      {note && <dd className="num text-xs text-muted">{note}</dd>}
    </div>
  )
}

function ScoreList({ items, empty }: { items: [string, number][]; empty: string }) {
  if (!items.length) return <p className="text-muted">{empty}</p>
  return (
    <ul className="grid gap-2">
      {items.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-sm">
          <span>{k}</span>
          <span className="h-2 rounded-full bg-track-empty">
            <span className="block h-2 rounded-full bg-track" style={{ width: `${v}%` }} />
          </span>
          <span className="num text-end">{v}%</span>
        </li>
      ))}
    </ul>
  )
}
