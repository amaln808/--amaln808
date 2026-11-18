/**
 * The smart assistant — free and on-device. Every suggestion comes from transparent rules
 * over the company's own data (no employee data leaves the app). A real AI model can later
 * replace these functions behind the same shapes.
 */
import { goalHealth, goalProgress, goalsOf, weightedAchievement } from './goals'
import { forecastNext } from './forecast'
import { reviewHistory } from './reviews'
import { levelsAt, skillGaps, skillGrowth } from './skills'
import { yearsBetween } from './dates'
import type { Db, Employee, GoalPeriod, JobFamily, SkillLevel } from './types'
import { L, SKILL_LEVELS } from './types'

export interface GoalIdea {
  title: L
  description: L
  period: GoalPeriod
  weight: number
  kpis: { name: L; unit: L; baseline: number; target: number }[]
  why: L
}

type T = [string, string, string, string, GoalPeriod, number, [string, string, string, string, number, number][]]
// [title ar, title en, description ar, description en, period, weight, kpis: [name ar, name en, unit ar, unit en, baseline, target]]
const TEMPLATES: Record<JobFamily, T[]> = {
  sales: [
    ['زيادة المبيعات السنوية', 'Grow annual sales', 'رفع قيمة المبيعات المغلقة مقارنة بالعام الماضي.', 'Increase closed sales value over last year.', 'quarterly', 35, [['قيمة المبيعات', 'Sales value', 'ألف ر.ع', 'k OMR', 0, 120]]],
    ['استقطاب عملاء جدد', 'Win new customers', 'فتح حسابات جديدة في القطاعات المستهدفة.', 'Open new accounts in target sectors.', 'quarterly', 20, [['عملاء جدد', 'New customers', 'عميل', 'customers', 0, 24]]],
    ['رفع نسبة إغلاق الفرص', 'Raise win rate', 'تحسين نسبة الفرص التي تتحول إلى عقود.', 'Convert more opportunities into contracts.', 'quarterly', 15, [['نسبة الإغلاق', 'Win rate', '%', '%', 18, 28]]],
    ['تقليل مدة التحصيل', 'Shorten collection time', 'متابعة المستحقات حتى تُحصَّل أسرع.', 'Follow receivables so cash comes in sooner.', 'monthly', 10, [['متوسط أيام التحصيل', 'Days sales outstanding', 'يوم', 'days', 60, 40]]],
  ],
  engineering: [
    ['تسليم مزايا خارطة الطريق', 'Ship roadmap features', 'إطلاق المزايا المخططة للسنة في مواعيدها.', 'Release the planned features on time.', 'quarterly', 35, [['مزايا مُطلقة', 'Features shipped', 'ميزة', 'features', 0, 12]]],
    ['رفع جودة الكود', 'Improve code quality', 'زيادة تغطية الاختبارات وتقليل الأعطال بعد الإطلاق.', 'More test coverage, fewer bugs after release.', 'quarterly', 20, [['تغطية الاختبارات', 'Test coverage', '%', '%', 45, 75], ['أعطال بعد الإطلاق شهرياً', 'Post-release bugs / month', 'عطل', 'bugs', 14, 5]]],
    ['تسريع الاستجابة للحوادث', 'Faster incident response', 'تقليل الوقت اللازم لإعادة الخدمة بعد أي عطل.', 'Cut the time to restore service after an incident.', 'monthly', 15, [['متوسط وقت الإصلاح', 'Mean time to recover', 'ساعة', 'hours', 6, 2]]],
    ['مشاركة المعرفة', 'Share knowledge', 'جلسات تعليمية وتوثيق للفريق.', 'Teaching sessions and documentation for the team.', 'quarterly', 10, [['جلسات وتوثيقات', 'Sessions & docs', 'مرة', 'items', 0, 8]]],
  ],
  hr: [
    ['تقليل دوران الموظفين', 'Reduce staff turnover', 'خفض نسبة الاستقالات الطوعية.', 'Lower voluntary resignations.', 'quarterly', 30, [['نسبة الدوران السنوية', 'Annual turnover', '%', '%', 14, 8]]],
    ['تسريع التوظيف', 'Hire faster', 'تقليل الأيام من فتح الوظيفة حتى قبول العرض.', 'Fewer days from opening to accepted offer.', 'quarterly', 25, [['متوسط أيام التوظيف', 'Average time to hire', 'يوم', 'days', 50, 30]]],
    ['إكمال دورات التقييم في موعدها', 'Reviews completed on time', 'كل تقييم يُنجز قبل موعده.', 'Every review finished before its due date.', 'annual', 20, [['التقييمات في الموعد', 'Reviews on time', '%', '%', 70, 100]]],
    ['ساعات التدريب لكل موظف', 'Training hours per person', 'برنامج تدريب يغطي فجوات المهارات.', 'A training programme aimed at skill gaps.', 'quarterly', 15, [['ساعات التدريب', 'Training hours', 'ساعة', 'hours', 0, 24]]],
  ],
  finance: [
    ['إقفال الحسابات الشهرية أسرع', 'Faster month-end close', 'إنهاء الإقفال الشهري في أيام أقل.', 'Close the books in fewer days.', 'monthly', 30, [['أيام الإقفال', 'Days to close', 'يوم', 'days', 10, 5]]],
    ['دقة الموازنة', 'Budget accuracy', 'تقليل الفرق بين الموازنة والفعلي.', 'Narrow the gap between budget and actual.', 'quarterly', 25, [['انحراف الموازنة', 'Budget variance', '%', '%', 12, 5]]],
    ['خفض التكاليف التشغيلية', 'Cut operating costs', 'إيجاد وفورات في العقود والمصروفات.', 'Find savings in contracts and spending.', 'annual', 20, [['الوفورات', 'Savings', 'ألف ر.ع', 'k OMR', 0, 30]]],
  ],
  operations: [
    ['التسليم في الموعد', 'On-time delivery', 'رفع نسبة الطلبات التي تُسلَّم في موعدها.', 'More orders delivered on time.', 'monthly', 35, [['التسليم في الموعد', 'On-time delivery', '%', '%', 82, 96]]],
    ['خفض الهدر', 'Reduce waste', 'تقليل التالف والمرتجعات.', 'Less waste and fewer returns.', 'quarterly', 25, [['نسبة الهدر', 'Waste rate', '%', '%', 6, 3]]],
    ['السلامة المهنية', 'Workplace safety', 'صفر حوادث مسجلة.', 'Zero recordable incidents.', 'annual', 15, [['أيام بلا حوادث', 'Days without incidents', 'يوم', 'days', 0, 365]]],
  ],
  marketing: [
    ['توليد عملاء محتملين', 'Generate qualified leads', 'حملات تجلب عملاء محتملين مؤهلين للمبيعات.', 'Campaigns that bring sales-ready leads.', 'monthly', 35, [['عملاء محتملون مؤهلون', 'Qualified leads', 'عميل', 'leads', 0, 600]]],
    ['تكلفة اكتساب العميل', 'Customer acquisition cost', 'خفض ما يُنفق لكسب كل عميل.', 'Spend less to win each customer.', 'quarterly', 25, [['التكلفة لكل عميل', 'Cost per customer', 'ر.ع', 'OMR', 90, 60]]],
    ['نمو الحضور الرقمي', 'Grow digital reach', 'زيادة المتابعين والتفاعل.', 'More followers and engagement.', 'quarterly', 15, [['المتابعون', 'Followers', 'ألف', 'k', 10, 25]]],
  ],
  support: [
    ['رضا العملاء', 'Customer satisfaction', 'رفع تقييم العملاء بعد كل تواصل.', 'Raise the rating customers give after each contact.', 'monthly', 35, [['رضا العملاء', 'CSAT', '%', '%', 80, 92]]],
    ['سرعة الرد الأول', 'Faster first response', 'الرد على الطلبات في وقت أقصر.', 'Answer requests sooner.', 'monthly', 25, [['زمن الرد الأول', 'First response time', 'دقيقة', 'minutes', 45, 15]]],
    ['الحل من أول تواصل', 'First-contact resolution', 'حل المشكلة دون تحويل أو تكرار.', 'Solve it without transfers or repeats.', 'quarterly', 20, [['الحل من أول تواصل', 'First-contact resolution', '%', '%', 60, 78]]],
  ],
  management: [
    ['تحقيق أهداف الإدارة', 'Deliver the department plan', 'متوسط إنجاز أهداف الفريق.', 'Average achievement of the team’s goals.', 'quarterly', 35, [['إنجاز أهداف الفريق', 'Team goal achievement', '%', '%', 0, 90]]],
    ['تطوير الفريق', 'Grow the team', 'خطة تطوير لكل موظف ومتابعتها.', 'A development plan for every report, followed up.', 'quarterly', 20, [['موظفون بخطة تطوير', 'Reports with a plan', '%', '%', 30, 100]]],
    ['تفاعل الموظفين', 'Employee engagement', 'رفع نتيجة استبيان التفاعل.', 'Raise the engagement survey score.', 'annual', 15, [['نتيجة الاستبيان', 'Survey score', '%', '%', 65, 80]]],
  ],
}

/** Goal ideas for an employee's job, scaled to seniority, skipping titles they already have */
export function suggestGoals(db: Db, emp: Employee, today: string): GoalIdea[] {
  const pos = db.positions.find((p) => p.id === emp.positionId)
  const family = pos?.family ?? 'management'
  const years = emp.priorExperienceYears + yearsBetween(emp.hireDate, today)
  const stretch = years >= 8 ? 1.25 : years >= 3 ? 1 : 0.8
  const have = new Set(goalsOf(db.goals, emp).map((g) => g.title.trim()))
  const ideas = [...TEMPLATES[family], ...(emp.role === 'manager' && family !== 'management' ? TEMPLATES.management.slice(0, 2) : [])]
  return ideas
    .filter((t) => !have.has(t[0]) && !have.has(t[1]))
    .map(([ta, te, da, de, period, weight, kpis]) => ({
      title: L(ta, te),
      description: L(da, de),
      period,
      weight,
      kpis: kpis.map(([na, ne, ua, ue, b, t]) => {
        let target = b < t ? b + (t - b) * stretch : b - (b - t) * Math.min(stretch, 1.1)
        if (ue === '%') target = Math.min(100, Math.max(0, target))
        return { name: L(na, ne), unit: L(ua, ue), baseline: b, target: Math.round(target * 10) / 10 }
      }),
      why: L(
        `مناسب لوظيفة «${pos?.title ?? '—'}»، والهدف ${stretch > 1 ? 'مرفوع لخبرته الطويلة' : stretch < 1 ? 'مخفف لأنه في بداية مسيرته' : 'بمستوى متوسط الخبرة'} (${years.toFixed(1)} سنة).`,
        `Fits the “${pos?.titleEn ?? '—'}” role; the target is ${stretch > 1 ? 'stretched for long experience' : stretch < 1 ? 'eased for an early-career employee' : 'set for mid-level experience'} (${years.toFixed(1)} yrs).`,
      ),
    }))
}

export interface PlanStep {
  skillId: string
  from: SkillLevel | 0
  to: SkillLevel
  weeks: number
  actions: L[]
  priority: 'high' | 'medium' | 'low'
}
const STEP_ACTIONS: Record<SkillLevel, L[]> = {
  1: [L('دورة تأسيسية قصيرة (عبر الإنترنت أو داخلية)', 'A short foundation course (online or in-house)'), L('مرافقة زميل خبير في العمل اليومي', 'Shadow an expert colleague day to day')],
  2: [L('دورة متوسطة مع تطبيق عملي', 'An intermediate course with hands-on practice'), L('مهمة صغيرة حقيقية تحت إشراف', 'A small real assignment under supervision')],
  3: [L('قيادة مشروع أو جزء من مشروع يعتمد على المهارة', 'Lead a project, or part of one, that depends on the skill'), L('شهادة مهنية معترف بها', 'A recognised professional certificate')],
  4: [L('تدريب الآخرين وتوجيههم في المهارة', 'Teach and mentor others in the skill'), L('تمثيل الشركة في مؤتمر أو كتابة دليل داخلي', 'Represent the company at an event or write an internal guide')],
}

/** A step-by-step plan to close the gap between the employee's skills and their position's needs */
export function skillPlan(db: Db, emp: Employee, today: string): PlanStep[] {
  const pos = db.positions.find((p) => p.id === emp.positionId)
  const levels = levelsAt(db.skillRecords, emp.id, today)
  const steps: PlanStep[] = []
  for (const g of skillGaps(pos, levels)) {
    for (let lv = g.current + 1; lv <= g.required; lv++)
      steps.push({
        skillId: g.skillId,
        from: (lv - 1) as SkillLevel | 0,
        to: lv as SkillLevel,
        weeks: lv * 4,
        actions: STEP_ACTIONS[lv as SkillLevel],
        priority: g.gap >= 2 ? 'high' : lv === g.required && g.gap === 1 ? 'medium' : 'low',
      })
  }
  // Skills that are at the required level but stalled: suggest the next level for the strongest ones
  if (!steps.length)
    for (const [skillId, lv] of [...levels].filter(([, lv]) => lv < 4).slice(0, 2))
      steps.push({ skillId, from: lv, to: (lv + 1) as SkillLevel, weeks: (lv + 1) * 4, actions: STEP_ACTIONS[(lv + 1) as SkillLevel], priority: 'low' })
  return steps
}

export interface Analysis {
  strengths: { key: string; label: L; value: number }[]
  weaknesses: { key: string; label: L; value: number }[]
  /** latest review percent, change from the previous, and the forecast */
  latest: number | null
  change: number | null
  forecast: ReturnType<typeof forecastNext>
  goalAchievement: number | null
  lateGoals: number
  recommendations: L[]
}

/** Strengths / weaknesses vs the employee's own average and the company's, plus recommendations */
export function analyze(db: Db, emp: Employee, today: string): Analysis {
  const { criteria, scale } = db.org
  const hist = reviewHistory(emp.id, db.reviews, db.cycles, criteria, scale)
  const last = hist.at(-1)
  const recent = hist.slice(-2)
  // company averages per criterion over the same cycles
  const companyAvg = (key: string) => {
    const ids = new Set(recent.map((h) => h.cycle.id))
    const v = db.reviews.filter((r) => ids.has(r.cycleId) && r.status === 'submitted' && r.scores[key] > 0).map((r) => r.scores[key])
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
  }
  const per = criteria
    .map((c) => {
      const v = recent.map((h) => h.review.scores[c.key]).filter((x) => x > 0)
      if (!v.length) return null
      const mine = v.reduce((s, x) => s + x, 0) / v.length
      const co = companyAvg(c.key) ?? mine
      return { key: c.key, label: L(c.ar, c.en), value: Math.round((mine / scale) * 100), rel: mine - co }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const byRel = [...per].sort((a, b) => b.rel - a.rel || b.value - a.value)
  const strengths = byRel.slice(0, 3).filter((x) => x.rel >= 0 || x.value >= 70)
  const weaknesses = byRel
    .slice(-3)
    .reverse()
    .filter((x) => !strengths.includes(x) && (x.rel < 0 || x.value < 70))

  const myGoals = goalsOf(db.goals, emp)
  const goalAchievement = weightedAchievement(myGoals, today)
  const late = myGoals.filter((g) => goalHealth(g, today, db.org.lateThreshold) === 'late')
  const forecast = forecastNext(hist.map((h) => h.percent))
  const recs: L[] = []
  for (const w of weaknesses.slice(0, 2)) recs.push(RECS[w.key] ?? L(`التركيز على «${w.label.ar}» بخطة قصيرة ومتابعة شهرية.`, `Focus on “${w.label.en}” with a short plan and monthly check-ins.`))
  if (late.length)
    recs.push(
      L(
        `${late.length} من أهدافه متأخرة: اجتماع متابعة لإعادة ترتيب الأولويات أو تعديل الهدف مع ذكر السبب.`,
        `${late.length} of their goals are behind: hold a check-in to re-prioritise, or adjust the goal with a stated reason.`,
      ),
    )
  if (forecast && forecast.trend === 'down')
    recs.push(L('أداؤه في انخفاض عبر التقييمات الأخيرة: حوار صريح لفهم الأسباب (عبء العمل، الوضوح، الدعم).', 'Scores are falling across recent reviews: talk openly about the causes (workload, clarity, support).'))
  if (forecast && forecast.trend === 'up' && (last?.percent ?? 0) >= 80)
    recs.push(L('أداء متصاعد ومرتفع: مرشح لمسؤوليات أكبر أو مسار ترقية.', 'Rising, high performance: a candidate for bigger responsibilities or a promotion track.'))
  const gaps = skillPlan(db, emp, today).filter((s) => s.priority === 'high')
  if (gaps.length) recs.push(L(`سد فجوة المهارات الأساسية لوظيفته (${gaps.length} خطوات عالية الأولوية في خطة التطوير).`, `Close the core skill gaps for the role (${gaps.length} high-priority steps in the development plan).`))
  if (!recs.length) recs.push(L('الأداء متوازن: المحافظة على الإيقاع مع هدف تطويري جديد واحد.', 'Balanced performance: keep the pace and add one new development goal.'))

  return {
    strengths: strengths.map(({ key, label, value }) => ({ key, label, value })),
    weaknesses: weaknesses.map(({ key, label, value }) => ({ key, label, value })),
    latest: last?.percent ?? null,
    change: hist.length >= 2 ? Math.round((hist.at(-1)!.percent - hist.at(-2)!.percent) * 10) / 10 : null,
    forecast,
    goalAchievement,
    lateGoals: late.length,
    recommendations: recs,
  }
}

const RECS: Record<string, L> = {
  goals: L('تقسيم الأهداف الكبيرة إلى مراحل شهرية ومراجعتها كل أسبوعين.', 'Break big goals into monthly steps and review them every two weeks.'),
  quality: L('مراجعة الأقران قبل التسليم وقائمة تحقق للجودة.', 'Peer review before hand-off and a quality checklist.'),
  commitment: L('اتفاق واضح على المواعيد ومتابعة أسبوعية قصيرة.', 'Clear agreement on deadlines and a short weekly check-in.'),
  teamwork: L('مشاركته في مشروع مشترك مع قسم آخر.', 'Put them on a shared project with another department.'),
  communication: L('دورة في التواصل والعرض، وتقديم ملخص أسبوعي للفريق.', 'A communication & presentation course, and a weekly summary to the team.'),
  leadership: L('قيادة مبادرة صغيرة أو توجيه موظف جديد.', 'Lead a small initiative or mentor a new joiner.'),
  creativity: L('وقت مخصص لاقتراح تحسين واحد كل ربع سنة.', 'Protected time to propose one improvement each quarter.'),
  technical: L('خطة تعلم تقنية مع شهادة مهنية مرتبطة بالوظيفة.', 'A technical learning plan with a role-relevant certificate.'),
}

/** An automatic annual summary paragraph for one employee */
export function annualSummary(db: Db, emp: Employee, year: number, today: string): L {
  const end = `${year}-12-31` < today ? `${year}-12-31` : today
  const a = analyze(db, emp, end)
  const pos = db.positions.find((p) => p.id === emp.positionId)
  const yearGoals = goalsOf(db.goals, emp).filter((g) => g.start.startsWith(String(year)) || g.end.startsWith(String(year)))
  const done = yearGoals.filter((g) => goalProgress(g, end) >= 1).length
  const hist = reviewHistory(emp.id, db.reviews, db.cycles, db.org.criteria, db.org.scale).filter((h) => h.cycle.start.startsWith(String(year)))
  const growth = skillGrowth(db.skillRecords, db.skills, emp.id, `${year}-01-01`, end).filter((g) => g.delta > 0)
  const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
  const scores = hist.map((h) => `${h.percent}%`)
  const s = (xs: { label: L }[], k: 'ar' | 'en') => xs.map((x) => x.label[k]).join(k === 'ar' ? ' و' : ', ')

  const ar = [
    `${emp.name}، ${pos?.title ?? ''}. في ${year} أنجز ${done} من ${yearGoals.length} أهداف، ونسبة تحقيق أهدافه الموزونة ${pct(a.goalAchievement)}.`,
    scores.length ? `نتائج تقييماته خلال السنة: ${scores.join(' ثم ')}${a.change != null ? ` (${a.change >= 0 ? 'تحسن' : 'تراجع'} ${Math.abs(a.change)} نقطة في آخر تقييم)` : ''}.` : 'لم يُستكمل له تقييم هذه السنة بعد.',
    a.strengths.length ? `أبرز نقاط قوته: ${s(a.strengths, 'ar')}.` : '',
    a.weaknesses.length ? `ومجالات التطوير: ${s(a.weaknesses, 'ar')}.` : '',
    growth.length ? `تطورت مهاراته في ${growth.map((g) => `${g.skill.name} (من ${SKILL_LEVELS[g.first].ar} إلى ${SKILL_LEVELS[g.current].ar})`).join('، ')}.` : '',
    a.forecast ? `التوقع للتقييم القادم نحو ${a.forecast.value}% (بين ${a.forecast.low}% و${a.forecast.high}%).` : '',
    `التوصية: ${a.recommendations[0].ar}`,
  ]
  const en = [
    `${emp.nameEn || emp.name}, ${pos?.titleEn ?? ''}. In ${year} they completed ${done} of ${yearGoals.length} goals, with a weighted goal achievement of ${pct(a.goalAchievement)}.`,
    scores.length ? `Review results this year: ${scores.join(' then ')}${a.change != null ? ` (${a.change >= 0 ? 'up' : 'down'} ${Math.abs(a.change)} points in the latest review)` : ''}.` : 'No review has been completed for them this year yet.',
    a.strengths.length ? `Main strengths: ${s(a.strengths, 'en')}.` : '',
    a.weaknesses.length ? `Areas to develop: ${s(a.weaknesses, 'en')}.` : '',
    growth.length ? `Skills grew in ${growth.map((g) => `${g.skill.nameEn} (${SKILL_LEVELS[g.first].en} → ${SKILL_LEVELS[g.current].en})`).join(', ')}.` : '',
    a.forecast ? `Next review is forecast near ${a.forecast.value}% (between ${a.forecast.low}% and ${a.forecast.high}%).` : '',
    `Recommendation: ${a.recommendations[0].en}`,
  ]
  return L(ar.filter(Boolean).join(' '), en.filter(Boolean).join(' '))
}
