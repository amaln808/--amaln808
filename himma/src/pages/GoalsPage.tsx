import { useMemo, useState, type FormEvent } from 'react'
import { endOfMonth, endOfQuarter, endOfYear, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { inScope, SCOPE_OPTIONS, useScopeFilter } from '../components/scope'
import { Button, Empty, ErrorText, Field, Input, Modal, ScopeTag, Section, Segmented, Suggest, inputClass } from '../components/ui'
import { errorText } from '../data/client'
import { iso, useStore, useToday, type Entry, type Goal } from '../data/store'
import { goalProgress, type GoalProgress } from '../domain/goals'
import type { Scope } from '../domain/performance'
import { fullDate, num, parseNum, pct, shortDate } from '../format'

const STATUS: Record<GoalProgress['status'], { text: string; cls: string }> = {
  reached: { text: 'تحقق الهدف', cls: 'text-good' },
  ahead: { text: 'على الخطة أو أسرع', cls: 'text-good' },
  behind: { text: 'أبطأ من الخطة', cls: 'text-late' },
  missed: { text: 'انتهت المدة دون الوصول', cls: 'text-late' },
  not_started: { text: 'لم تبدأ مدته بعد', cls: 'text-muted' },
}

export function GoalsPage() {
  const store = useStore()
  const today = useToday()
  const [scope, setScope] = useScopeFilter()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [adding, setAdding] = useState<Goal | null>(null)

  const goals = store.goals.filter(inScope(scope)).sort((a, b) => a.endDate.localeCompare(b.endDate))
  const current = goals.filter((g) => !g.archived && g.endDate >= today)
  const past = goals.filter((g) => g.archived || g.endDate < today).reverse()

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">الأهداف</h1>
        <Segmented label="عرض" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
      </div>
      <p className="mt-2 text-muted">هدف برقم ومدة، مثل «بيع 500 علبة حتى نهاية ديسمبر». سجّلي التقدم كلما حصل، والخط الرفيع يبين أين يجب أن تكوني اليوم.</p>
      <Button onClick={() => setEditing('new')} className="mt-4">
        <Plus size={20} aria-hidden /> هدف جديد
      </Button>

      <Section title="الأهداف الجارية">
        {current.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {current.map((g) => (
              <GoalCard key={g.id} goal={g} today={today} onAdd={() => setAdding(g)} onEdit={() => setEditing(g)} />
            ))}
          </div>
        ) : (
          <Empty>لا أهداف جارية. أضيفي هدفاً واحداً تريدين الوصول إليه هذا الشهر.</Empty>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="أهداف سابقة">
          <div className="grid gap-4 lg:grid-cols-2">
            {past.map((g) => (
              <GoalCard key={g.id} goal={g} today={today} onAdd={() => setAdding(g)} onEdit={() => setEditing(g)} />
            ))}
          </div>
        </Section>
      )}

      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} defaultScope={scope === 'all' ? 'work' : scope} onClose={() => setEditing(null)} />}
      {adding && <EntryForm goal={adding} onClose={() => setAdding(null)} />}
    </>
  )
}

function GoalCard({ goal, today, onAdd, onEdit }: { goal: Goal; today: string; onAdd: () => void; onEdit: () => void }) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const entries = useMemo(
    () => store.entries.filter((e) => e.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date)),
    [store.entries, goal.id],
  )
  const p = goalProgress(goal, entries.map((e) => e.amount), today)
  const unit = goal.unit ? ` ${goal.unit}` : ''
  const st = STATUS[p.status]
  const fill = Math.min(1, Math.max(0, p.pct))
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{goal.title}</h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
            <ScopeTag scope={goal.scope} />
            <span>
              {shortDate(goal.startDate)} – {shortDate(goal.endDate)}
            </span>
          </p>
        </div>
        <button type="button" onClick={onEdit} className="min-h-11 px-2 text-sm text-button">
          تعديل
        </button>
      </div>

      <p className="mt-4">
        <span className="num text-3xl font-bold">{num(p.total)}</span>
        <span className="text-muted">
          {' '}
          من <span className="num">{num(goal.target)}</span>
          {unit}
        </span>
        <span className="num ms-2 text-sm text-muted">({pct(p.pct)})</span>
      </p>

      <div
        className="relative mt-3 h-3 rounded-full bg-brand-soft"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={goal.target}
        aria-valuenow={p.total}
        aria-label={`${goal.title}: ${num(p.total)} من ${num(goal.target)}`}
      >
        <div className={`absolute inset-y-0 start-0 rounded-full ${p.status === 'reached' ? 'bg-saffron' : 'bg-button'}`} style={{ width: `${fill * 100}%` }} />
        {p.status !== 'reached' && p.expectedPct > 0 && p.expectedPct < 1 && (
          <div className="absolute -inset-y-1 w-0.5 rounded bg-ink" style={{ insetInlineStart: `${p.expectedPct * 100}%` }} title={`المتوقع اليوم: ${num(p.expected)}`} />
        )}
      </div>

      <p className={`mt-3 text-sm font-medium ${st.cls}`}>{st.text}</p>
      <p className="mt-1 text-sm text-muted">
        {p.status === 'behind' || p.status === 'ahead'
          ? `المتوقع حتى اليوم ${whole(p.expected, goal.target)}${unit}. ${
              p.perDay === null
                ? ''
                : p.perDay >= 1
                  ? `تحتاجين ${whole(p.perDay, goal.target, true)}${unit} يومياً في ${p.daysLeft} يوماً باقية.`
                  : `باقٍ ${num(goal.target - p.total)}${unit} في ${p.daysLeft} يوماً.`
            }`
          : p.status === 'not_started'
            ? `يبدأ ${fullDate(goal.startDate)}.`
            : null}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onAdd}>
          <Plus size={18} aria-hidden /> تسجيل تقدّم
        </Button>
        {entries.length > 0 && (
          <Button kind="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'إخفاء السجل' : `السجل (${entries.length})`}
          </Button>
        )}
      </div>
      {open && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} unit={unit} />
          ))}
        </ul>
      )}
    </article>
  )
}

function EntryRow({ entry, unit }: { entry: Entry; unit: string }) {
  const store = useStore()
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="num w-16 shrink-0 text-muted">{shortDate(entry.date)}</span>
      <span className="num shrink-0 font-medium" dir="ltr">
        {entry.amount > 0 ? '+' : ''}
        {num(entry.amount)}
      </span>
      <span className="min-w-0 flex-1 truncate text-muted">
        {unit.trim()} {entry.note}
      </span>
      <button
        type="button"
        aria-label="حذف هذا التسجيل"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:text-late"
        onClick={() => confirm('حذف هذا التسجيل؟') && void store.removeEntry(entry)}
      >
        <Trash2 size={18} />
      </button>
    </li>
  )
}

/** Whole numbers for goals counted in whole units (jars, books); rounded up when it is a need. */
export const whole = (n: number, target: number, up = false) =>
  num(Number.isInteger(target) ? (up ? Math.ceil(n) : Math.round(n)) : n)

type Span = 'month' | 'quarter' | 'year' | 'custom'

function GoalForm({ goal, defaultScope, onClose }: { goal?: Goal; defaultScope: Scope; onClose: () => void }) {
  const store = useStore()
  const units = useMemo(() => [...new Set(store.goals.map((g) => g.unit).filter((u): u is string => !!u))], [store.goals])
  const now = new Date()
  const spans: Record<Exclude<Span, 'custom'>, [string, string]> = {
    month: [iso(startOfMonth(now)), iso(endOfMonth(now))],
    quarter: [iso(startOfQuarter(now)), iso(endOfQuarter(now))],
    year: [iso(startOfYear(now)), iso(endOfYear(now))],
  }
  const [f, setF] = useState({
    title: goal?.title ?? '',
    scope: goal?.scope ?? defaultScope,
    unit: goal?.unit ?? '',
    target: goal ? String(goal.target) : '',
    span: (goal ? 'custom' : 'month') as Span,
    startDate: goal?.startDate ?? spans.month[0],
    endDate: goal?.endDate ?? spans.month[1],
    notes: goal?.notes ?? '',
    archived: goal?.archived ?? false,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const pickSpan = (s: Span) =>
    setF((x) => (s === 'custom' ? { ...x, span: s } : { ...x, span: s, startDate: spans[s][0], endDate: spans[s][1] }))

  async function save(e: FormEvent) {
    e.preventDefault()
    const target = parseNum(f.target)
    if (!f.title.trim()) return setError('اكتبي الهدف.')
    if (!target || target <= 0) return setError('اكتبي الرقم المطلوب الوصول إليه (أكبر من صفر).')
    if (f.endDate < f.startDate) return setError('تاريخ النهاية قبل تاريخ البداية.')
    setBusy(true)
    try {
      await store.saveGoal({
        id: goal?.id,
        title: f.title.trim(),
        scope: f.scope,
        unit: f.unit.trim() || null,
        target,
        startDate: f.startDate,
        endDate: f.endDate,
        notes: f.notes.trim() || null,
        archived: f.archived,
      })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!goal || !confirm('حذف الهدف وكل ما سُجّل له نهائياً؟')) return
    try {
      await store.removeGoal(goal)
      onClose()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Modal title={goal ? 'تعديل الهدف' : 'هدف جديد'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="الهدف">
          <Input autoFocus={!goal} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="مثال: بيع علب زوردة" />
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-muted">النوع</span>
          <Segmented
            label="النوع"
            value={f.scope}
            onChange={(v) => set('scope', v)}
            options={[
              { value: 'work', label: 'عمل' },
              { value: 'personal', label: 'شخصي' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="الرقم المطلوب">
            <Input inputMode="decimal" value={f.target} onChange={(e) => set('target', e.target.value)} placeholder="500" />
          </Field>
          <Field label="الوحدة (اختياري)">
            <Suggest options={units} value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="علبة، عميل، كتاب…" />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-muted">المدة</span>
          <Segmented
            label="المدة"
            value={f.span}
            onChange={pickSpan}
            options={[
              { value: 'month', label: 'هذا الشهر' },
              { value: 'quarter', label: 'هذا الربع' },
              { value: 'year', label: 'هذه السنة' },
              { value: 'custom', label: 'تواريخ أخرى' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="من">
            <Input type="date" required value={f.startDate} onChange={(e) => setF((x) => ({ ...x, span: 'custom', startDate: e.target.value }))} />
          </Field>
          <Field label="إلى">
            <Input type="date" required value={f.endDate} onChange={(e) => setF((x) => ({ ...x, span: 'custom', endDate: e.target.value }))} />
          </Field>
        </div>
        <Field label="ملاحظات (اختياري)">
          <textarea className={`${inputClass} min-h-20 py-2`} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {goal && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5 accent-[var(--button)]" checked={f.archived} onChange={(e) => set('archived', e.target.checked)} />
            نقله إلى الأهداف السابقة
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2 border-t border-line pt-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : 'حفظ'}
          </Button>
          {goal && (
            <Button kind="danger" className="ms-auto" onClick={remove}>
              حذف
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

function EntryForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const store = useStore()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(iso(new Date()))
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    const n = parseNum(amount)
    if (!n) return setError('اكتبي الرقم (يمكن أن يكون سالباً لتصحيح تسجيل سابق).')
    setBusy(true)
    try {
      await store.addEntry({ goalId: goal.id, amount: n, date, note: note.trim() || null })
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <Modal title={`تقدّم: ${goal.title}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`الكمية${goal.unit ? ` (${goal.unit})` : ''}`}>
            <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="التاريخ">
            <Input type="date" required value={date} max={iso(new Date())} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {date < goal.startDate || date > goal.endDate ? (
          <p className="text-sm text-muted">ملاحظة: التاريخ خارج مدة الهدف ({shortDate(goal.startDate)} – {shortDate(goal.endDate)}) ويُحسب مع ذلك.</p>
        ) : null}
        <Field label="ماذا حصل؟ (اختياري)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: طلبية صيدلية الشفاء" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          حفظ
        </Button>
      </form>
    </Modal>
  )
}

