/**
 * مسار data model. Every record carries `orgId` so one database can hold many companies
 * (the Supabase phase adds row-level security on org membership).
 */
export type Role = 'admin' | 'hr' | 'manager' | 'employee'
export type Lang = 'ar' | 'en'
/** A bilingual string produced by the domain layer */
export interface L {
  ar: string
  en: string
}
export const L = (ar: string, en: string): L => ({ ar, en })

export interface Criterion {
  key: string
  ar: string
  en: string
  /** relative weight in the overall score */
  weight: number
}

export interface Org {
  id: string
  name: string
  nameEn: string
  scale: 5 | 10
  cyclesPerYear: 2 | 3
  criteria: Criterion[]
  /** alert this many days before a review is due */
  reviewAlertDays: number
  /** a goal is "at risk" when it trails the time elapsed by this many points, "late" at twice that */
  lateThreshold: number
}

export interface Department {
  id: string
  orgId: string
  name: string
  nameEn: string
}

export type JobFamily = 'sales' | 'engineering' | 'hr' | 'finance' | 'operations' | 'marketing' | 'support' | 'management'
export type SkillLevel = 1 | 2 | 3 | 4

export interface Position {
  id: string
  orgId: string
  title: string
  titleEn: string
  departmentId: string
  family: JobFamily
  requiredSkills: { skillId: string; level: SkillLevel }[]
}

export interface Employee {
  id: string
  orgId: string
  name: string
  nameEn: string
  email: string
  phone: string
  departmentId: string
  positionId: string
  managerId: string | null
  role: Role
  hireDate: string
  /** years of experience before joining */
  priorExperienceYears: number
  active: boolean
}

export type SkillCategory = 'technical' | 'soft' | 'leadership'
export interface Skill {
  id: string
  orgId: string
  name: string
  nameEn: string
  category: SkillCategory
}

/** One assessment of one skill; the history of these is the growth curve */
export interface SkillRecord {
  id: string
  orgId: string
  employeeId: string
  skillId: string
  level: SkillLevel
  date: string
  byId: string
  note: string
}

export type GoalPeriod = 'monthly' | 'quarterly' | 'annual'
export interface KpiEntry {
  date: string
  value: number
  byId?: string
}
export interface Kpi {
  id: string
  name: string
  unit: string
  baseline: number
  target: number
  entries: KpiEntry[]
}
export interface GoalChange {
  at: string
  byId: string
  note: string
}
export interface Goal {
  id: string
  orgId: string
  title: string
  description: string
  scope: 'individual' | 'team'
  /** individual: the owners; team: the members (empty = the whole department) */
  employeeIds: string[]
  departmentId: string | null
  /** importance, in percent of the owner's year */
  weight: number
  start: string
  end: string
  period: GoalPeriod
  kpis: Kpi[]
  status: 'active' | 'done' | 'cancelled'
  createdById: string
  createdAt: string
  changes: GoalChange[]
}

export interface ReviewCycle {
  id: string
  orgId: string
  name: string
  nameEn: string
  /** the period the review covers */
  start: string
  end: string
  dueDate: string
}

export type Scores = Record<string, number>
export type ReviewStatus = 'not_started' | 'self_done' | 'submitted'
export interface Review {
  id: string
  orgId: string
  cycleId: string
  employeeId: string
  reviewerId: string
  scores: Scores
  selfScores: Scores
  managerNotes: string
  selfNotes: string
  status: ReviewStatus
  submittedAt: string | null
}

export interface Db {
  org: Org
  departments: Department[]
  positions: Position[]
  employees: Employee[]
  skills: Skill[]
  skillRecords: SkillRecord[]
  goals: Goal[]
  cycles: ReviewCycle[]
  reviews: Review[]
  /** notices the user has dismissed */
  readNotices: string[]
}
export type Collection = Exclude<keyof Db, 'org' | 'readNotices'>

export const DEFAULT_CRITERIA: Criterion[] = [
  { key: 'goals', ar: 'تحقيق الأهداف', en: 'Goal achievement', weight: 2 },
  { key: 'quality', ar: 'جودة العمل', en: 'Quality of work', weight: 1 },
  { key: 'commitment', ar: 'الالتزام', en: 'Commitment', weight: 1 },
  { key: 'teamwork', ar: 'العمل الجماعي', en: 'Teamwork', weight: 1 },
  { key: 'communication', ar: 'التواصل', en: 'Communication', weight: 1 },
  { key: 'leadership', ar: 'القيادة', en: 'Leadership', weight: 1 },
  { key: 'creativity', ar: 'الإبداع', en: 'Creativity', weight: 1 },
  { key: 'technical', ar: 'المهارات التقنية', en: 'Technical skills', weight: 1 },
]

export const SKILL_LEVELS: Record<SkillLevel, L> = {
  1: L('مبتدئ', 'Beginner'),
  2: L('متوسط', 'Intermediate'),
  3: L('متقدم', 'Advanced'),
  4: L('خبير', 'Expert'),
}
