import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Info, XCircle } from 'lucide-react'
import { useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { visibleEmployees } from '../domain/access'
import { noticesFor, type Notice } from '../domain/alerts'
import { goalHealth, goalProgress, goalsOf, monthLabel, weightedAchievement, weightedExpected } from '../domain/goals'
import { reviewHistory, scorePercent, sortCycles } from '../domain/reviews'
import { levelsAt } from '../domain/skills'
import { monthEnd, minIso } from '../domain/dates'
import { SKILL_LEVELS, type Employee, type Goal } from '../domain/types'
import { Avatar, Empty, Figures, HealthBadge, PageHead, Pill, Sheet } from '../components/ui'
import { Track } from '../components/Track'
import { Bars, ChartFrame, Lines } from '../components/charts'
import { useLookups } from '../components/lookups'

export function DashboardPage() {
  const me = useMe()
  return me.role === 'employee' ? <MyDashboard me={me} /> : <TeamDashboard me={me} />
}

function TeamDashboard({ me }: { me: Employee }) {
  const { db, today } = useStore()
  const { t, tl, nm, pct, lang } = usePrefs()
  const lk = useLookups()
  const { criteria, scale } = db.org
  const people = visibleEmployees(me, db.employees.filter((e) => e.active)).filter((e) => me.role !== 'manager' || e.id !== me.id)
  const goalSet = new Map<string, Goal>()
  for (const e of people) for (const g of goalsOf(db.goals, e)) goalSet.set(g.id, g)
  const goals = [...goalSet.values()].filter((g) => g.status !== 'cancelled')
  const healths = goals.map((g) => goalHealth(g, today, db.org.lateThreshold))
  const onTrack = healths.filter((h) => h === 'done' || h === 'on_track').length
  const ach = people.map((e) => weightedAchievement(goalsOf(db.goals, e), today)).filter((x): x is number => x != null)
  const avgAch = ach.length ? ach.reduce((s, x) => s + x, 0) / ach.length : null
  const exp = people.map((e) => weightedExpected(goalsOf(db.goals, e), today)).filter((x): x is number => x != null)
  const avgExp = exp.length ? exp.reduce((s, x) => s + x, 0) / exp.length : null

  const cycles = sortCycles(db.cycles).filter((c) => c.start <= today)
  const lastDone = [...cycles].reverse().find((c) => c.dueDate < today) ?? cycles.at(-1)
  const latest = people
    .map((e) => {
      const h = reviewHistory(e.id, db.reviews, db.cycles, criteria, scale)
      const last = h.at(-1)
      return { e, last: last?.percent ?? null, change: h.length > 1 ? last!.percent - h.at(-2)!.percent : null }
    })
    .filter((x) => x.last != null)
  const avgScore = latest.length ? latest.reduce((s, x) => s + x.last!, 0) / latest.length : null
  const top = [...latest].sort((a, b) => b.last! - a.last!).slice(0, 5)

  // Goal achievement month by month (team average) against where it should be
  const Y = Number(today.slice(0, 4))
  const months = Array.from({ length: Number(today.slice(5, 7)) }, (_, m) => {
    const d = minIso(monthEnd(Y, m), today)
    const a = people.map((e) => weightedAchievement(goalsOf(db.goals, e), d)).filter((x): x is number => x != null)
    const ex = people.map((e) => weightedExpected(goalsOf(db.goals, e), d)).filter((x): x is number => x != null)
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 100) : null)
    return { m: tl(monthLabel(m)), actual: avg(a), expected: avg(ex) }
  })

  // Average of the last finished review by department
  const byDep = db.departments
    .map((d) => {
      const v = db.reviews
        .filter((r) => r.cycleId === lastDone?.id && r.status === 'submitted' && people.some((p) => p.id === r.employeeId && p.departmentId === d.id))
        .map((r) => scorePercent(r.scores, criteria, scale)!)
      return { d: nm(d), score: v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null }
    })
    .filter((x) => x.score != null)

  const bins = ['< 60', '60–69', '70–79', '80–89', '90+']
  const dist = bins.map((b, i) => ({
    b,
    n: latest.filter((x) => {
      const v = x.last!
      return i === 0 ? v < 60 : i === 4 ? v >= 90 : v >= 50 + i * 10 && v < 60 + i * 10
    }).length,
  }))

  const notices = noticesFor(db, me, today).filter((n) => !db.readNotices.includes(n.id))
  const rtl = lang === 'ar'

  return (
    <>
      <PageHead title={t('لوحة التحكم', 'Dashboard')} sub={me.role === 'manager' ? t(`فريقك: ${people.length} موظفاً`, `Your team: ${people.length} people`) : nm(db.org)} />
      <Figures
        items={[
          { label: t('عدد الموظفين', 'People'), value: people.length, note: t(`${db.departments.length} أقسام`, `${db.departments.length} departments`) },
          { label: t('مستوى الإنجاز العام', 'Overall progress'), value: pct(avgAch), note: t(`المتوقع حتى اليوم ${pct(avgExp)}`, `Expected by today ${pct(avgExp)}`) },
          { label: t('أهداف على المسار', 'Goals on track'), value: pct(goals.length ? onTrack / goals.length : null), note: t(`${onTrack} من ${goals.length} هدفاً`, `${onTrack} of ${goals.length} goals`) },
          { label: t('متوسط آخر تقييم', 'Average latest review'), value: avgScore == null ? '—' : `${Math.round(avgScore)}%`, note: lastDone ? lk.cycle(lastDone.id) : undefined },
        ]}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Sheet title={t('تنبيهات', 'Alerts')} action={<Link to="/notifications" className="text-sm text-button underline-offset-4 hover:underline">{t('كل الإشعارات', 'All notifications')}</Link>}>
          {notices.length ? (
            <ul className="grid gap-2">{notices.slice(0, 5).map((n) => <NoticeRow key={n.id} n={n} />)}</ul>
          ) : (
            <Empty>{t('لا شيء يحتاج انتباهك اليوم.', 'Nothing needs your attention today.')}</Empty>
          )}
        </Sheet>
        <Sheet title={t('الأعلى أداءً', 'Top performers')}>
          {top.length ? (
            <ol className="grid gap-1">
              {top.map(({ e, last, change }, i) => (
                <li key={e.id}>
                  <Link to={`/employees/${e.id}`} className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-brand-soft">
                    <span className="num w-5 text-center text-sm text-muted">{i + 1}</span>
                    <Avatar name={e.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nm(e)}</span>
                      <span className="block truncate text-xs text-muted">{lk.pos(e.positionId)}</span>
                    </span>
                    <span className="num text-end">
                      <b>{Math.round(last!)}%</b>
                      {change != null && change !== 0 && (
                        <span className={`flex items-center justify-end text-xs ${change > 0 ? 'text-good' : 'text-late'}`}>
                          {change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {Math.abs(Math.round(change))}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>{t('لا تقييمات مكتملة بعد.', 'No completed reviews yet.')}</Empty>
          )}
        </Sheet>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title={t('إنجاز الأهداف عبر السنة', 'Goal progress through the year')}
          note={t('متوسط الإنجاز الموزون مقابل المتوقع لو سارت الأهداف بانتظام', 'Average weighted progress vs. where an even pace would be')}
          head={[t('الشهر', 'Month'), t('المنجز', 'Actual'), t('المتوقع', 'Expected')]}
          rows={months.map((m) => [m.m, `${m.actual ?? '—'}%`, `${m.expected ?? '—'}%`])}
        >
          <Lines
            data={months}
            x="m"
            rtl={rtl}
            series={[
              { key: 'actual', name: t('المنجز', 'Actual'), color: 'var(--s1)' },
              { key: 'expected', name: t('المتوقع', 'Expected'), color: 'var(--muted)', dashed: true },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title={t('متوسط التقييم حسب القسم', 'Average review by department')}
          note={lastDone ? lk.cycle(lastDone.id) : undefined}
          head={[t('القسم', 'Department'), t('المتوسط', 'Average')]}
          rows={byDep.map((x) => [x.d, `${x.score}%`])}
        >
          <Bars data={byDep} x="d" rtl={rtl} horizontal series={[{ key: 'score', name: t('المتوسط', 'Average'), color: 'var(--s1)' }]} />
        </ChartFrame>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <ChartFrame
          title={t('توزيع نتائج آخر تقييم', 'Spread of latest review results')}
          head={[t('النتيجة', 'Result'), t('عدد الموظفين', 'People')]}
          rows={dist.map((d) => [d.b, d.n])}
        >
          <Bars data={dist} x="b" rtl={rtl} unit="" domain={[0, Math.max(4, ...dist.map((d) => d.n))]} series={[{ key: 'n', name: t('الموظفون', 'People'), color: 'var(--s1)' }]} />
        </ChartFrame>
        <Sheet title={t('مسار كل موظف', 'Everyone’s track')}>
          <ul className="grid gap-3">
            {people.map((e) => {
              const gs = goalsOf(db.goals, e)
              return (
                <li key={e.id} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3">
                  <Link to={`/employees/${e.id}`} className="truncate text-sm font-medium hover:underline">
                    {nm(e)}
                  </Link>
                  <Track goals={gs} today={today} compact />
                  <span className="num text-end text-sm">{pct(weightedAchievement(gs, today))}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">{t('كل قطعة هدف بعرض وزنه، والخط الداكن داخلها موضعه المتوقع اليوم.', 'Each segment is a goal sized by its weight; the dark line inside marks where it should be today.')}</p>
        </Sheet>
      </div>
    </>
  )
}

export function NoticeRow({ n, onDismiss }: { n: Notice; onDismiss?: () => void }) {
  const { tl, t } = usePrefs()
  const Icon = n.severity === 'late' ? XCircle : n.severity === 'warn' ? AlertTriangle : n.kind.startsWith('review') || n.kind === 'self_due' ? Bell : Info
  const tone = n.severity === 'late' ? 'text-late bg-late-soft' : n.severity === 'warn' ? 'text-warn bg-warn-soft' : 'text-ink bg-brand-soft'
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line p-2">
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon size={18} aria-hidden />
      </span>
      <Link to={n.link} className="min-w-0 flex-1">
        <span className="block font-medium">{tl(n.title)}</span>
        <span className="block truncate text-sm text-muted">{tl(n.detail)}</span>
      </Link>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="min-h-10 rounded-lg px-2 text-sm text-muted hover:bg-brand-soft">
          {t('تم', 'Done')}
        </button>
      )}
    </li>
  )
}

function MyDashboard({ me }: { me: Employee }) {
  const { db, today } = useStore()
  const { t, tl, pct } = usePrefs()
  const lk = useLookups()
  const goals = goalsOf(db.goals, me)
  const notices = noticesFor(db, me, today).filter((n) => !db.readNotices.includes(n.id))
  const hist = reviewHistory(me.id, db.reviews, db.cycles, db.org.criteria, db.org.scale)
  const levels = levelsAt(db.skillRecords, me.id, today)
  return (
    <>
      <PageHead title={t(`مرحباً ${me.name.split(' ')[0]}`, `Hello, ${(me.nameEn || me.name).split(' ')[0]}`)} sub={lk.pos(me.positionId)} />
      <Sheet>
        <Track goals={goals} today={today} label={t('مساري هذه السنة', 'My track this year')} />
      </Sheet>
      {notices.length > 0 && (
        <ul className="mt-5 grid gap-2">{notices.slice(0, 4).map((n) => <NoticeRow key={n.id} n={n} />)}</ul>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Sheet title={t('أهدافي', 'My goals')}>
          <ul className="divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id}>
                <Link to={`/goals/${g.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-button">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{g.title}</span>
                    <span className="block text-xs text-muted">
                      {g.scope === 'team' ? t('هدف جماعي', 'Team goal') : t('هدف فردي', 'Individual')} · {t('الوزن', 'Weight')} {g.weight}%
                    </span>
                  </span>
                  <span className="num font-bold">{pct(goalProgress(g, today))}</span>
                  <HealthBadge health={goalHealth(g, today, db.org.lateThreshold)} />
                </Link>
              </li>
            ))}
          </ul>
        </Sheet>
        <div className="grid content-start gap-5">
          <Sheet title={t('تقييماتي', 'My reviews')}>
            {hist.length ? (
              <ul className="grid gap-1.5">
                {hist.slice(-3).map((h) => (
                  <li key={h.cycle.id} className="flex justify-between gap-2">
                    <span className="text-muted">{lk.cycle(h.cycle.id)}</span>
                    <b className="num">{h.percent}%</b>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t('لا تقييمات بعد', 'No reviews yet')}</Empty>
            )}
            <Link to="/reviews" className="mt-3 inline-block text-sm text-button hover:underline">
              {t('التقييم الذاتي', 'Self-assessment')}
            </Link>
          </Sheet>
          <Sheet title={t('مهاراتي', 'My skills')}>
            <ul className="flex flex-wrap gap-1.5">
              {[...levels].map(([id, lv]) => (
                <Pill key={id} tone="brand">
                  {lk.skill(id)} · {tl(SKILL_LEVELS[lv])}
                </Pill>
              ))}
            </ul>
          </Sheet>
        </div>
      </div>
    </>
  )
}
