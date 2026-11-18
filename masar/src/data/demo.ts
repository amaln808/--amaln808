/**
 * The fictional demo company («شركة رواسي التجريبية»). Generated from today's date with a fixed
 * random seed, so the story is always current: last year's three reviews, this year's first two
 * done, the third due in December, and goals measured month by month up to today.
 */
import { cycleSlices } from '../domain/reviews'
import { suggestGoals } from '../domain/insights'
import { iso, monthEnd } from '../domain/dates'
import type { Db, Department, Employee, Goal, JobFamily, Position, Review, Role, Skill, SkillLevel, SkillRecord } from '../domain/types'
import { DEFAULT_CRITERIA } from '../domain/types'

export const DEMO_ORG = 'org-demo'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildDemo(today: string): Db {
  const r = rng(20261118)
  const Y = Number(today.slice(0, 4))
  const o = DEMO_ORG

  const departments: Department[] = [
    ['d-mgmt', 'الإدارة العليا', 'Executive office'],
    ['d-sales', 'المبيعات', 'Sales'],
    ['d-tech', 'التقنية', 'Technology'],
    ['d-hr', 'الموارد البشرية', 'Human resources'],
    ['d-fin', 'المالية', 'Finance'],
    ['d-cs', 'خدمة العملاء', 'Customer care'],
  ].map(([id, name, nameEn]) => ({ id, orgId: o, name, nameEn }))

  const skills: Skill[] = (
    [
      ['sk-neg', 'التفاوض', 'Negotiation', 'soft'],
      ['sk-crm', 'إدارة علاقات العملاء', 'Client relationships', 'soft'],
      ['sk-code', 'البرمجة', 'Programming', 'technical'],
      ['sk-cloud', 'الحوسبة السحابية', 'Cloud computing', 'technical'],
      ['sk-test', 'اختبار البرمجيات', 'Software testing', 'technical'],
      ['sk-data', 'تحليل البيانات', 'Data analysis', 'technical'],
      ['sk-acc', 'المعايير المحاسبية', 'Accounting standards', 'technical'],
      ['sk-hire', 'التوظيف والمقابلات', 'Recruiting & interviewing', 'soft'],
      ['sk-svc', 'خدمة العملاء', 'Customer service', 'soft'],
      ['sk-comm', 'التواصل والعرض', 'Communication & presenting', 'soft'],
      ['sk-lead', 'قيادة الفرق', 'Team leadership', 'leadership'],
      ['sk-pm', 'إدارة المشاريع', 'Project management', 'leadership'],
      ['sk-time', 'إدارة الوقت', 'Time management', 'soft'],
    ] as const
  ).map(([id, name, nameEn, category]) => ({ id, orgId: o, name, nameEn, category }))

  const P = (id: string, title: string, titleEn: string, departmentId: string, family: JobFamily, req: [string, SkillLevel][]): Position => ({
    id,
    orgId: o,
    title,
    titleEn,
    departmentId,
    family,
    requiredSkills: req.map(([skillId, level]) => ({ skillId, level })),
  })
  const positions: Position[] = [
    P('p-ceo', 'الرئيس التنفيذي', 'Chief executive', 'd-mgmt', 'management', [['sk-lead', 4], ['sk-comm', 4], ['sk-pm', 3]]),
    P('p-sysadmin', 'مسؤول الأنظمة', 'Systems administrator', 'd-tech', 'engineering', [['sk-cloud', 3], ['sk-code', 2], ['sk-time', 3]]),
    P('p-sales-head', 'مدير المبيعات', 'Head of sales', 'd-sales', 'sales', [['sk-neg', 4], ['sk-lead', 3], ['sk-crm', 3], ['sk-data', 2]]),
    P('p-sales-rep', 'مندوب مبيعات', 'Account executive', 'd-sales', 'sales', [['sk-neg', 3], ['sk-crm', 3], ['sk-comm', 3], ['sk-time', 2]]),
    P('p-tech-head', 'مدير التقنية', 'Head of technology', 'd-tech', 'engineering', [['sk-code', 4], ['sk-cloud', 3], ['sk-lead', 3], ['sk-pm', 3]]),
    P('p-dev', 'مطور برمجيات', 'Software developer', 'd-tech', 'engineering', [['sk-code', 3], ['sk-test', 3], ['sk-cloud', 2], ['sk-time', 2]]),
    P('p-hr-head', 'مديرة الموارد البشرية', 'HR manager', 'd-hr', 'hr', [['sk-hire', 4], ['sk-comm', 3], ['sk-lead', 3], ['sk-data', 2]]),
    P('p-hr-off', 'أخصائي موارد بشرية', 'HR specialist', 'd-hr', 'hr', [['sk-hire', 3], ['sk-comm', 3], ['sk-time', 2]]),
    P('p-fin-head', 'المدير المالي', 'Finance manager', 'd-fin', 'finance', [['sk-acc', 4], ['sk-data', 3], ['sk-lead', 3]]),
    P('p-acct', 'محاسب', 'Accountant', 'd-fin', 'finance', [['sk-acc', 3], ['sk-data', 3], ['sk-time', 2]]),
    P('p-cs-head', 'مشرف خدمة العملاء', 'Customer care lead', 'd-cs', 'support', [['sk-svc', 4], ['sk-lead', 3], ['sk-comm', 3]]),
    P('p-cs-agent', 'ممثل خدمة العملاء', 'Customer care agent', 'd-cs', 'support', [['sk-svc', 3], ['sk-comm', 3], ['sk-time', 2]]),
  ]
  const posOf = new Map(positions.map((p) => [p.id, p]))

  const E = (id: string, name: string, nameEn: string, positionId: string, managerId: string | null, role: Role, hire: string, prior: number): Employee => ({
    id,
    orgId: o,
    name,
    nameEn,
    email: `${nameEn.split(' ')[0].toLowerCase()}@rawasi.example`,
    phone: `9${Math.floor(1000000 + r() * 8999999)}`,
    departmentId: posOf.get(positionId)!.departmentId,
    positionId,
    managerId,
    role,
    hireDate: hire,
    priorExperienceYears: prior,
    active: true,
  })
  const y = (n: number, md: string) => `${Y - n}-${md}`
  const employees: Employee[] = [
    E('e-ceo', 'خالد البلوشي', 'Khalid Al Balushi', 'p-ceo', null, 'manager', y(9, '02-01'), 12),
    E('e-admin', 'سالم الحارثي', 'Salim Al Harthi', 'p-sysadmin', 'e-tech', 'admin', y(4, '06-15'), 3),
    E('e-hr', 'مريم الكندية', 'Maryam Al Kindi', 'p-hr-head', 'e-ceo', 'hr', y(6, '03-10'), 7),
    E('e-sales', 'يوسف الرواحي', 'Yousuf Al Rawahi', 'p-sales-head', 'e-ceo', 'manager', y(5, '09-01'), 8),
    E('e-tech', 'هند الهنائية', 'Hind Al Hinai', 'p-tech-head', 'e-ceo', 'manager', y(7, '01-20'), 6),
    E('e-fin', 'أحمد السيابي', 'Ahmed Al Siyabi', 'p-fin-head', 'e-ceo', 'manager', y(3, '05-05'), 10),
    E('e-cs', 'عائشة المعمرية', 'Aisha Al Maamari', 'p-cs-head', 'e-ceo', 'manager', y(4, '11-01'), 5),
    E('e-s1', 'فاطمة الشكيلية', 'Fatma Al Shukaili', 'p-sales-rep', 'e-sales', 'employee', y(3, '02-14'), 2),
    E('e-s2', 'ناصر العامري', 'Nasser Al Amri', 'p-sales-rep', 'e-sales', 'employee', y(1, '08-01'), 0),
    E('e-s3', 'ريم الزدجالية', 'Reem Al Zadjali', 'p-sales-rep', 'e-sales', 'employee', y(2, '04-01'), 4),
    E('e-t1', 'عمر الفارسي', 'Omar Al Farsi', 'p-dev', 'e-tech', 'employee', y(3, '01-10'), 1),
    E('e-t2', 'شيماء البوسعيدية', 'Shaima Al Busaidi', 'p-dev', 'e-tech', 'employee', y(2, '07-01'), 3),
    E('e-t3', 'بدر المقبالي', 'Badr Al Muqbali', 'p-dev', 'e-tech', 'employee', y(1, '03-15'), 0),
    E('e-h1', 'لينا العبرية', 'Lina Al Abri', 'p-hr-off', 'e-hr', 'employee', y(2, '10-01'), 2),
    E('e-f1', 'سعيد الغافري', 'Saeed Al Ghafri', 'p-acct', 'e-fin', 'employee', y(4, '01-05'), 6),
    E('e-f2', 'منى الوهيبية', 'Mona Al Wahaibi', 'p-acct', 'e-fin', 'employee', y(1, '06-01'), 1),
    E('e-c1', 'حمد اليحيائي', 'Hamad Al Yahyai', 'p-cs-agent', 'e-cs', 'employee', y(2, '02-01'), 1),
    E('e-c2', 'نوال الجابرية', 'Nawal Al Jabri', 'p-cs-agent', 'e-cs', 'employee', y(3, '09-15'), 3),
  ]

  // Each person's story: base ability (of 5), trend per review, and pace on goals
  const story = new Map(employees.map((e) => [e.id, { base: 2.9 + r() * 1.5, trend: (r() - 0.35) * 0.35, pace: 0.72 + r() * 0.45 }]))
  story.get('e-s2')!.trend = 0.28 // the fast learner
  story.get('e-c1')!.pace = 0.5 // the one behind on goals
  story.get('e-c1')!.trend = -0.2
  story.get('e-t2')!.base = 4.4

  const org = {
    id: o,
    name: 'شركة رواسي التجريبية',
    nameEn: 'Rawasi Demo Co.',
    scale: 5 as const,
    cyclesPerYear: 3 as const,
    criteria: DEFAULT_CRITERIA,
    reviewAlertDays: 45,
    lateThreshold: 15,
  }

  const cycles = [Y - 1, Y].flatMap((yr) =>
    cycleSlices(yr, 3).map((s) => ({
      id: `c-${yr}-${s.index}`,
      orgId: o,
      name: `التقييم ${['الأول', 'الثاني', 'الثالث'][s.index - 1]} ${yr}`,
      nameEn: `Review ${s.index} · ${yr}`,
      start: s.start,
      end: s.end,
      dueDate: s.due,
    })),
  )

  // Skills: a first assessment early last year, then growth at each half-year
  const skillRecords: SkillRecord[] = []
  let sr = 0
  for (const e of employees) {
    const pos = posOf.get(e.positionId)!
    const extra = skills[Math.floor(r() * skills.length)].id
    const ids = [...new Set([...pos.requiredSkills.map((s) => s.skillId), extra])]
    const st = story.get(e.id)!
    for (const sid of ids) {
      const req = pos.requiredSkills.find((s) => s.skillId === sid)?.level ?? 2
      let lv = Math.max(1, Math.min(4, req - 1 - (r() < 0.3 ? 1 : 0) + (st.base > 4 ? 1 : 0))) as SkillLevel
      const dates = [`${Y - 1}-01-20`, `${Y - 1}-07-10`, `${Y}-01-15`, `${Y}-07-12`].filter((d) => d <= today && d >= e.hireDate.slice(0, 8) + '01')
      dates.forEach((date, i) => {
        if (i > 0 && lv < 4 && r() < 0.32 + st.trend) lv = (lv + 1) as SkillLevel
        if (i === 0 || r() < 0.85)
          skillRecords.push({ id: `sr-${++sr}`, orgId: o, employeeId: e.id, skillId: sid, level: lv, date, byId: e.managerId ?? 'e-hr', note: '' })
      })
    }
  }

  const base: Db = { org, departments, positions, employees, skills, skillRecords, goals: [], cycles, reviews: [], readNotices: [] }

  // Goals for this year, measured month by month up to today
  const goals: Goal[] = []
  let gid = 0
  const monthsDone = Number(today.slice(5, 7))
  const kpiEntries = (baseline: number, target: number, pace: number) => {
    const out = []
    for (let m = 0; m < monthsDone; m++) {
      const date = m === monthsDone - 1 ? today : monthEnd(Y, m)
      const f = Math.min(1.05, ((m + 1) / 12) * pace + (r() - 0.5) * 0.06)
      const v = baseline + (target - baseline) * Math.max(0, f)
      out.push({ date, value: Math.round(v * 10) / 10 })
    }
    return out
  }
  for (const e of employees) {
    const st = story.get(e.id)!
    const ideas = suggestGoals(base, e, today).slice(0, 3)
    const share = ideas.reduce((s, g) => s + g.weight, 0)
    ideas.forEach((idea, i) => {
      gid++
      goals.push({
        id: `g-${gid}`,
        orgId: o,
        title: idea.title.ar,
        description: idea.description.ar,
        scope: 'individual',
        employeeIds: [e.id],
        departmentId: e.departmentId,
        weight: Math.round((idea.weight / share) * 75),
        start: `${Y}-01-01`,
        end: `${Y}-12-31`,
        period: idea.period,
        kpis: idea.kpis.map((k, j) => ({
          id: `k-${gid}-${j}`,
          name: k.name.ar,
          unit: k.unit.ar,
          baseline: k.baseline,
          target: k.target,
          entries: kpiEntries(k.baseline, k.target, st.pace * (i === 2 ? 0.85 : 1)),
        })),
        status: 'active',
        createdById: e.managerId ?? 'e-hr',
        createdAt: `${Y}-01-05`,
        changes: [],
      })
    })
  }
  // One team goal per department (25% of each member's year)
  const teamGoal: Record<string, [string, string, string, number, number]> = {
    'd-sales': ['إيرادات القسم السنوية', 'إجمالي مبيعات فريق المبيعات.', 'ألف ر.ع', 0, 450],
    'd-tech': ['إطلاق المنصة الجديدة', 'إكمال مراحل مشروع المنصة الجديدة.', 'مرحلة', 0, 6],
    'd-hr': ['برنامج التدريب السنوي', 'إكمال ساعات التدريب المخططة للشركة.', 'ساعة', 0, 400],
    'd-fin': ['التحول إلى الفوترة الإلكترونية', 'نقل كل الفواتير إلى النظام الإلكتروني.', '%', 0, 100],
    'd-cs': ['رضا العملاء العام', 'متوسط رضا العملاء لكل القنوات.', '%', 78, 90],
    'd-mgmt': ['الخطة الاستراتيجية', 'إنجاز مبادرات الخطة الاستراتيجية للسنة.', 'مبادرة', 0, 8],
  }
  for (const d of departments) {
    const [title, description, unit, b, t] = teamGoal[d.id]
    gid++
    goals.push({
      id: `g-${gid}`,
      orgId: o,
      title,
      description,
      scope: 'team',
      employeeIds: [],
      departmentId: d.id,
      weight: 25,
      start: `${Y}-01-01`,
      end: `${Y}-12-31`,
      period: 'quarterly',
      kpis: [{ id: `k-${gid}-0`, name: title, unit, baseline: b, target: t, entries: kpiEntries(b, t, 0.75 + r() * 0.35) }],
      status: 'active',
      createdById: 'e-ceo',
      createdAt: `${Y}-01-03`,
      changes: [],
    })
  }
  // A goal that was changed during the year, with its reason
  const edited = goals.find((g) => g.employeeIds.includes('e-s1'))!
  edited.kpis[0].target = Math.round(edited.kpis[0].target * 0.9)
  edited.changes.push({ at: `${Y}-06-02`, byId: 'e-sales', note: 'خُفّض المستهدف 10% بعد تأجيل مناقصة كبيرة إلى العام القادم.' })

  // Reviews: last year's three and this year's first two submitted; the third in progress
  const reviews: Review[] = []
  const offs = new Map(employees.map((e) => [e.id, Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.key, (r() - 0.5) * 1.4]))]))
  cycles.forEach((c, i) => {
    if (c.start > today) return
    for (const e of employees) {
      if (e.hireDate > c.end) continue
      const st = story.get(e.id)!
      const cur = c.dueDate >= today
      const status = !cur ? 'submitted' : r() < 0.3 ? 'submitted' : r() < 0.55 ? 'self_done' : 'not_started'
      const sc = (bias = 0) =>
        Object.fromEntries(
          DEFAULT_CRITERIA.map((cr) => [cr.key, Math.max(1, Math.min(5, Math.round(st.base + st.trend * (i - 2) + offs.get(e.id)![cr.key] + (r() - 0.5) * 0.8 + bias)))]),
        )
      reviews.push({
        id: `r-${c.id}-${e.id}`,
        orgId: o,
        cycleId: c.id,
        employeeId: e.id,
        reviewerId: e.managerId ?? 'e-hr',
        scores: status === 'submitted' ? sc() : {},
        selfScores: status === 'not_started' ? {} : sc(0.3),
        managerNotes: status === 'submitted' ? NOTES[Math.floor(r() * NOTES.length)] : '',
        selfNotes: status === 'not_started' ? '' : SELF[Math.floor(r() * SELF.length)],
        status,
        submittedAt: status === 'submitted' ? (cur ? today : c.dueDate) : null,
      })
    }
  })

  return { ...base, goals, reviews }
}

const NOTES = [
  'أداء ثابت ومسؤول، ويحتاج مزيداً من المبادرة في اقتراح الحلول.',
  'تحسن واضح في جودة التسليم هذه الفترة، مع ضرورة الالتزام بالمواعيد.',
  'عنصر متعاون ويرفع روح الفريق؛ ننصح بدورة في العرض والتواصل.',
  'نتائج قوية في الأهداف، والخطوة التالية تطوير مهارات القيادة.',
  'يحتاج متابعة أقرب على الأهداف المتأخرة وخطة أسبوعية واضحة.',
]
const SELF = [
  'أنجزت معظم ما خُطط له، وأرغب في تدريب على الأدوات الجديدة.',
  'واجهت ضغطاً في الربع الماضي بسبب المشاريع المتزامنة.',
  'أرى أنني تطورت في التواصل مع العملاء وأحتاج دعماً في التخطيط.',
  'راضٍ عن نتائجي، وأطمح لمسؤوليات أكبر في الفريق.',
]

export const demoToday = () => iso(new Date())
