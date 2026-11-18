import { visibleEmployees } from '../domain/access'
import { goalHealth, goalProgress, goalsOf, HEALTH, isGoalOf, weightedAchievement } from '../domain/goals'
import { forecastNext } from '../domain/forecast'
import { reviewHistory, scorePercent, sortCycles } from '../domain/reviews'
import { yearsBetween } from '../domain/dates'
import type { Db, Employee, Lang } from '../domain/types'

type Cell = { value: string | number; fontWeight?: 'bold'; format?: string } | null

/** Three sheets: people summary, goals, reviews. Pure, so it is tested without a browser. */
export function buildWorkbook(db: Db, viewer: Employee, today: string, lang: Lang) {
  const ar = lang === 'ar'
  const tt = (a: string, e: string) => (ar ? a : e)
  const people = visibleEmployees(viewer, db.employees.filter((e) => e.active))
  const name = (id: string | null) => {
    const e = db.employees.find((x) => x.id === id)
    return e ? (ar ? e.name : e.nameEn || e.name) : ''
  }
  const dep = (id: string | null) => {
    const d = db.departments.find((x) => x.id === id)
    return d ? (ar ? d.name : d.nameEn) : ''
  }
  const pos = (id: string) => {
    const p = db.positions.find((x) => x.id === id)
    return p ? (ar ? p.title : p.titleEn) : ''
  }
  const head = (xs: string[]): Cell[] => xs.map((value) => ({ value, fontWeight: 'bold' }))
  const pct = (x: number | null): Cell => (x == null ? null : { value: x, format: '0%' })
  const { criteria, scale } = db.org

  const summary: Cell[][] = [
    head([tt('الموظف', 'Employee'), tt('القسم', 'Department'), tt('المنصب', 'Position'), tt('المدير', 'Manager'), tt('سنوات الخبرة', 'Experience (yrs)'), tt('إنجاز الأهداف', 'Goal achievement'), tt('آخر تقييم', 'Latest review'), tt('التغير', 'Change'), tt('التوقع القادم', 'Next forecast')]),
    ...people.map((e) => {
      const h = reviewHistory(e.id, db.reviews, db.cycles, criteria, scale)
      const f = forecastNext(h.map((x) => x.percent))
      return [
        { value: ar ? e.name : e.nameEn || e.name },
        { value: dep(e.departmentId) },
        { value: pos(e.positionId) },
        { value: name(e.managerId) },
        { value: Math.round((e.priorExperienceYears + yearsBetween(e.hireDate, today)) * 10) / 10 },
        pct(weightedAchievement(goalsOf(db.goals, e), today)),
        h.length ? pct(h.at(-1)!.percent / 100) : null,
        h.length > 1 ? { value: Math.round((h.at(-1)!.percent - h.at(-2)!.percent) * 10) / 10 } : null,
        f ? pct(f.value / 100) : null,
      ] as Cell[]
    }),
  ]

  const goals = db.goals.filter((g) => people.some((e) => isGoalOf(g, e)))
  const goalSheet: Cell[][] = [
    head([tt('الهدف', 'Goal'), tt('النوع', 'Type'), tt('المسؤول', 'Owner'), tt('الوزن', 'Weight'), tt('البداية', 'Start'), tt('النهاية', 'End'), tt('الإنجاز', 'Progress'), tt('الحالة', 'Status'), tt('المؤشرات', 'KPIs')]),
    ...goals.map((g) => [
      { value: g.title },
      { value: g.scope === 'team' ? tt('جماعي', 'Team') : tt('فردي', 'Individual') },
      { value: g.scope === 'team' ? dep(g.departmentId) : g.employeeIds.map(name).join(', ') },
      { value: g.weight / 100, format: '0%' },
      { value: g.start },
      { value: g.end },
      pct(goalProgress(g, today)),
      { value: HEALTH[goalHealth(g, today, db.org.lateThreshold)][lang] },
      { value: g.kpis.map((k) => `${k.name}: ${k.baseline} → ${k.target} ${k.unit}`).join(' | ') },
    ] as Cell[]),
  ]

  const reviewSheet: Cell[][] = [head([tt('الدورة', 'Cycle'), tt('الموظف', 'Employee'), ...criteria.map((c) => (ar ? c.ar : c.en)), tt('النتيجة', 'Result'), tt('ملاحظات المدير', 'Manager notes'), tt('ملاحظات الموظف', 'Employee notes')])]
  for (const c of sortCycles(db.cycles))
    for (const r of db.reviews.filter((x) => x.cycleId === c.id && x.status === 'submitted' && people.some((p) => p.id === x.employeeId)))
      reviewSheet.push([
        { value: ar ? c.name : c.nameEn },
        { value: name(r.employeeId) },
        ...criteria.map((cr) => (r.scores[cr.key] ? { value: r.scores[cr.key] } : null)),
        pct((scorePercent(r.scores, criteria, scale) ?? 0) / 100),
        { value: r.managerNotes },
        { value: r.selfNotes },
      ])

  return [
    { sheet: tt('الموظفون', 'People'), data: summary },
    { sheet: tt('الأهداف', 'Goals'), data: goalSheet },
    { sheet: tt('التقييمات', 'Reviews'), data: reviewSheet },
  ]
}

export async function downloadWorkbook(sheets: ReturnType<typeof buildWorkbook>, filename: string, rtl: boolean) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const blob = await writeXlsxFile(sheets.map((s) => ({ sheet: s.sheet, data: s.data, rightToLeft: rtl }))).toBlob()
  download(blob, filename)
}

export async function downloadPdf(el: HTMLElement, filename: string) {
  const { renderPdf } = await import('../../../src/features/documents/pdf')
  const { blob } = await renderPdf(el, { fitUpTo: 1.3 })
  download(blob, filename)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
