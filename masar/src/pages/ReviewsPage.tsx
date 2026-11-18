import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCog, CheckCircle2, Sparkles } from 'lucide-react'
import { newId, useMe, useStore } from '../data/store'
import { usePrefs } from '../i18n'
import { can, canManage, visibleEmployees } from '../domain/access'
import { daysBetween } from '../domain/dates'
import { goalsOf, weightedAchievement } from '../domain/goals'
import { cycleSlices, scorePercent, sortCycles, suggestedGoalScore } from '../domain/reviews'
import type { Employee, Review, ReviewCycle, Scores } from '../domain/types'
import { Avatar, Button, Empty, Field, Input, Modal, PageHead, Pill, Select, Sheet, Textarea } from '../components/ui'
import { useLookups } from '../components/lookups'

const blank = (cycle: ReviewCycle, emp: Employee, orgId: string): Review => ({
  id: newId(),
  orgId,
  cycleId: cycle.id,
  employeeId: emp.id,
  reviewerId: emp.managerId ?? '',
  scores: {},
  selfScores: {},
  managerNotes: '',
  selfNotes: '',
  status: 'not_started',
  submittedAt: null,
})

export function ReviewsPage() {
  const me = useMe()
  const { db, today } = useStore()
  const { t, nm, date } = usePrefs()
  const lk = useLookups()
  const [params, setParams] = useSearchParams()
  const cycles = sortCycles(db.cycles)
  const current = cycles.find((c) => c.start <= today && today <= c.dueDate) ?? [...cycles].reverse().find((c) => c.start <= today) ?? cycles.at(-1)
  const cycle = cycles.find((c) => c.id === params.get('cycle')) ?? current
  const [open, setOpen] = useState<{ emp: Employee; mode: 'manager' | 'self' } | null>(null)
  const [manageCycles, setManageCycles] = useState(false)

  if (!cycle)
    return (
      <>
        <PageHead title={t('التقييمات', 'Reviews')} />
        <Empty action={can(me, 'manage_cycles') && <Button onClick={() => setManageCycles(true)}>{t('إنشاء دورات التقييم', 'Create review cycles')}</Button>}>
          {t('لا توجد دورات تقييم بعد.', 'There are no review cycles yet.')}
        </Empty>
        {manageCycles && <CyclesModal onClose={() => setManageCycles(false)} />}
      </>
    )

  const left = daysBetween(today, cycle.dueDate)
  const reviewOf = (e: Employee) => db.reviews.find((r) => r.cycleId === cycle.id && r.employeeId === e.id)
  const others = visibleEmployees(me, db.employees.filter((e) => e.active && e.hireDate <= cycle.end)).filter((e) => e.id !== me.id)
  const done = others.filter((e) => reviewOf(e)?.status === 'submitted').length
  const mine = reviewOf(me)

  return (
    <>
      <PageHead title={t('التقييمات', 'Reviews')} sub={t(`${db.org.cyclesPerYear} دورات في السنة، الدرجات من 1 إلى ${db.org.scale}`, `${db.org.cyclesPerYear} cycles a year, scored 1 to ${db.org.scale}`)}>
        {can(me, 'manage_cycles') && (
          <Button kind="quiet" onClick={() => setManageCycles(true)}>
            <CalendarCog size={17} /> {t('دورات التقييم', 'Review cycles')}
          </Button>
        )}
      </PageHead>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={cycle.id} onChange={(e) => setParams({ cycle: e.target.value })} className="w-auto" aria-label={t('الدورة', 'Cycle')}>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {lk.cycle(c.id)}
            </option>
          ))}
        </Select>
        <span className="text-sm text-muted">
          {t('الفترة', 'Covers')} {date(cycle.start)} – {date(cycle.end)} · {t('الموعد', 'Due')} {date(cycle.dueDate)}{' '}
          {left >= 0 ? <Pill tone={left <= 7 ? 'warn' : 'brand'}>{t(`باقي ${left} يوماً`, `${left} days left`)}</Pill> : <Pill>{t('انتهى الموعد', 'Closed')}</Pill>}
        </span>
      </div>

      {cycle.start <= today && (
        <Sheet title={t('تقييمي الذاتي', 'My self-assessment')} className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted">
              {mine?.status === 'submitted'
                ? t(`اعتمد مديرك تقييمك: ${scorePercent(mine.scores, db.org.criteria, db.org.scale)}%`, `Your manager submitted your review: ${scorePercent(mine.scores, db.org.criteria, db.org.scale)}%`)
                : mine && mine.status === 'self_done'
                  ? t('أرسلت تقييمك الذاتي، ويمكنك تعديله حتى يعتمد مديرك التقييم.', 'You sent your self-assessment; you can edit it until your manager submits the review.')
                  : t('قيّم نفسك في كل عنصر، واكتب ما أنجزته وما تحتاجه.', 'Score yourself on each item and note what you achieved and what you need.')}
            </p>
            <Button kind={mine?.status === 'not_started' || !mine ? 'primary' : 'quiet'} onClick={() => setOpen({ emp: me, mode: 'self' })}>
              {mine?.status === 'submitted' ? t('عرض التقييم', 'View review') : mine?.status === 'self_done' ? t('تعديل تقييمي الذاتي', 'Edit my self-assessment') : t('ابدأ التقييم الذاتي', 'Start self-assessment')}
            </Button>
          </div>
        </Sheet>
      )}

      {me.role !== 'employee' && (
        <Sheet title={t(`تقييمات ${me.role === 'manager' ? 'فريقي' : 'الموظفين'} — ${done} من ${others.length} معتمدة`, `${me.role === 'manager' ? 'My team' : 'Staff'} reviews — ${done} of ${others.length} submitted`)}>
          {others.length ? (
            <ul className="divide-y divide-line">
              {others.map((e) => {
                const r = reviewOf(e)
                const may = canManage(me, e, db.employees)
                const score = r?.status === 'submitted' ? scorePercent(r.scores, db.org.criteria, db.org.scale) : null
                return (
                  <li key={e.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2">
                    <Avatar name={e.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{nm(e)}</span>
                      <span className="block text-xs text-muted">
                        {lk.pos(e.positionId)} · {t('المقيِّم', 'Reviewer')}: {lk.person(e.managerId)}
                      </span>
                    </span>
                    {r?.status === 'submitted' ? (
                      <Pill tone="good">
                        <CheckCircle2 size={13} /> {t('معتمد', 'Submitted')} <b className="num">{score}%</b>
                      </Pill>
                    ) : r?.status === 'self_done' ? (
                      <Pill tone="brand">{t('قيّم نفسه — بانتظار المدير', 'Self done — awaiting manager')}</Pill>
                    ) : Object.keys(r?.scores ?? {}).length ? (
                      <Pill tone="warn">{t('مسودة', 'Draft')}</Pill>
                    ) : (
                      <Pill>{t('لم يبدأ', 'Not started')}</Pill>
                    )}
                    {may && (
                      <Button kind={r?.status === 'submitted' ? 'quiet' : 'primary'} className="min-h-9" onClick={() => setOpen({ emp: e, mode: 'manager' })}>
                        {r?.status === 'submitted' ? t('عرض/تعديل', 'View/edit') : t('تقييم', 'Review')}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>{t('لا يوجد موظفون في نطاقك لهذه الدورة.', 'No one in your scope for this cycle.')}</Empty>
          )}
        </Sheet>
      )}

      {open && <ReviewForm cycle={cycle} emp={open.emp} mode={open.mode} existing={reviewOf(open.emp)} onClose={() => setOpen(null)} />}
      {manageCycles && <CyclesModal onClose={() => setManageCycles(false)} />}
    </>
  )
}

function ScorePicker({ value, onChange, scale, label, readOnly }: { value: number | undefined; onChange?: (n: number) => void; scale: number; label: string; readOnly?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={`num size-10 rounded-lg border text-sm font-bold ${value === n ? 'border-button bg-button text-on-brand' : value != null && n < value ? 'border-transparent bg-brand-soft text-ink' : 'border-line text-muted'} ${readOnly ? 'cursor-default' : 'hover:border-button'}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function ReviewForm({ cycle, emp, mode, existing, onClose }: { cycle: ReviewCycle; emp: Employee; mode: 'manager' | 'self'; existing?: Review; onClose: () => void }) {
  const me = useMe()
  const { db, today, save } = useStore()
  const { t, nm, pct, lang } = usePrefs()
  const [r, setR] = useState<Review>(existing ?? blank(cycle, emp, db.org.id))
  const { criteria, scale } = db.org
  const locked = mode === 'self' && r.status === 'submitted'
  const scores: Scores = mode === 'manager' ? r.scores : r.selfScores
  const setScore = (k: string, n: number) => setR((x) => (mode === 'manager' ? { ...x, scores: { ...x.scores, [k]: n } } : { ...x, selfScores: { ...x.selfScores, [k]: n } }))
  const achievement = weightedAchievement(goalsOf(db.goals, emp), cycle.end < today ? cycle.end : today)
  const suggestion = achievement == null ? null : suggestedGoalScore(achievement, scale)
  const percent = scorePercent(scores, criteria, scale)
  const missing = criteria.filter((c) => !(scores[c.key] > 0))

  const persist = (status: Review['status']) => {
    save('reviews', { ...r, reviewerId: mode === 'manager' ? me.id : r.reviewerId || (emp.managerId ?? ''), status, submittedAt: status === 'submitted' ? today : r.submittedAt })
    onClose()
  }

  return (
    <Modal title={mode === 'self' ? t('التقييم الذاتي', 'Self-assessment') : `${t('تقييم', 'Review')}: ${nm(emp)}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{lang === 'ar' ? cycle.name : cycle.nameEn}</span>
        <span>
          {t('النتيجة', 'Result')} <b className="num text-xl text-ink">{percent == null ? '—' : `${percent}%`}</b>
        </span>
      </div>
      <ul className="divide-y divide-line">
        {criteria.map((c) => (
          <li key={c.key} className="grid gap-2 py-3 sm:grid-cols-[11rem_1fr] sm:items-start">
            <div>
              <div className="font-medium">{lang === 'ar' ? c.ar : c.en}</div>
              {c.weight !== 1 && <div className="text-xs text-muted">{t(`وزن ×${c.weight}`, `weight ×${c.weight}`)}</div>}
            </div>
            <div className="grid gap-1.5">
              <ScorePicker value={scores[c.key]} onChange={(n) => setScore(c.key, n)} scale={scale} label={lang === 'ar' ? c.ar : c.en} readOnly={locked} />
              {mode === 'manager' && r.selfScores[c.key] > 0 && (
                <span className="text-xs text-muted">
                  {t('تقييم الموظف لنفسه:', 'Employee’s own score:')} <b className="num text-ink">{r.selfScores[c.key]}</b>
                </span>
              )}
              {c.key === 'goals' && suggestion != null && mode === 'manager' && (
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Sparkles size={13} /> {t(`إنجاز أهدافه الموزون ${pct(achievement)} ← الدرجة المقترحة ${suggestion}`, `Weighted goal achievement ${pct(achievement)} → suggested score ${suggestion}`)}
                  {scores.goals !== suggestion && (
                    <button type="button" onClick={() => setScore('goals', suggestion)} className="min-h-8 rounded-md px-2 text-button underline">
                      {t('استخدمها', 'Use it')}
                    </button>
                  )}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-3">
        {mode === 'manager' ? (
          <>
            {r.selfNotes && (
              <p className="rounded-lg bg-sunk p-3 text-sm">
                <span className="text-muted">{t('ملاحظات الموظف: ', 'Employee’s notes: ')}</span>
                {r.selfNotes}
              </p>
            )}
            <Field label={t('ملاحظات المدير', 'Manager’s notes')}>
              <Textarea value={r.managerNotes} onChange={(e) => setR({ ...r, managerNotes: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label={t('ملاحظاتي (ما أنجزته، ما واجهني، ما أحتاجه)', 'My notes (what I achieved, what got in the way, what I need)')}>
              <Textarea value={r.selfNotes} onChange={(e) => setR({ ...r, selfNotes: e.target.value })} readOnly={locked} />
            </Field>
            {r.status === 'submitted' && r.managerNotes && (
              <p className="rounded-lg bg-sunk p-3 text-sm">
                <span className="text-muted">{t('ملاحظات المدير: ', 'Manager’s notes: ')}</span>
                {r.managerNotes}
              </p>
            )}
          </>
        )}
      </div>
      {!locked && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {mode === 'manager' && missing.length > 0 && <span className="me-auto text-sm text-muted">{t(`باقي ${missing.length} عناصر بلا درجة`, `${missing.length} items still unscored`)}</span>}
          <Button kind="quiet" onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </Button>
          {mode === 'manager' ? (
            <>
              <Button kind="quiet" onClick={() => persist(r.status === 'submitted' ? 'submitted' : Object.keys(r.selfScores).length ? 'self_done' : 'not_started')}>
                {t('حفظ كمسودة', 'Save draft')}
              </Button>
              <Button disabled={missing.length > 0} onClick={() => persist('submitted')}>
                {t('اعتماد التقييم', 'Submit review')}
              </Button>
            </>
          ) : (
            <Button disabled={criteria.some((c) => !(r.selfScores[c.key] > 0))} onClick={() => persist('self_done')}>
              {t('إرسال تقييمي الذاتي', 'Send my self-assessment')}
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}

/** HR/admin: create the year's cycles from the company setting (2 or 3 a year) and adjust due dates */
function CyclesModal({ onClose }: { onClose: () => void }) {
  const { db, today, save, remove } = useStore()
  const { t, lang } = usePrefs()
  const [year, setYear] = useState(Number(today.slice(0, 4)) + (today.slice(5) > '10-01' ? 1 : 0))
  const exists = db.cycles.some((c) => c.start.startsWith(String(year)))
  const create = () => {
    const ord = ['الأول', 'الثاني', 'الثالث']
    for (const s of cycleSlices(year, db.org.cyclesPerYear))
      save('cycles', { id: newId(), orgId: db.org.id, name: `التقييم ${ord[s.index - 1]} ${year}`, nameEn: `Review ${s.index} · ${year}`, start: s.start, end: s.end, dueDate: s.due })
  }
  return (
    <Modal title={t('دورات التقييم', 'Review cycles')} onClose={onClose} wide>
      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-sunk p-3">
        <Field label={t('السنة', 'Year')}>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </Field>
        <Button onClick={create} disabled={exists}>
          {t(`إنشاء ${db.org.cyclesPerYear} دورات لسنة ${year}`, `Create ${db.org.cyclesPerYear} cycles for ${year}`)}
        </Button>
        {exists && <span className="text-sm text-muted">{t('دورات هذه السنة موجودة.', 'This year’s cycles exist.')}</span>}
      </div>
      <ul className="mt-4 divide-y divide-line">
        {sortCycles(db.cycles)
          .reverse()
          .map((c) => {
            const used = db.reviews.some((r) => r.cycleId === c.id)
            return (
              <li key={c.id} className="grid gap-2 py-2 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
                <span>
                  <b>{lang === 'ar' ? c.name : c.nameEn}</b>
                  <span className="block text-xs text-muted">
                    {c.start} → {c.end}
                  </span>
                </span>
                <Field label={t('موعد الإنجاز', 'Due date')}>
                  <Input type="date" value={c.dueDate} onChange={(e) => save('cycles', { ...c, dueDate: e.target.value })} />
                </Field>
                <Button kind="ghost" disabled={used} onClick={() => remove('cycles', c.id)} title={used ? t('فيها تقييمات', 'Has reviews') : undefined}>
                  {t('حذف', 'Delete')}
                </Button>
              </li>
            )
          })}
      </ul>
    </Modal>
  )
}
