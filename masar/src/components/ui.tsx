import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, X, XCircle } from 'lucide-react'
import type { Health } from '../domain/goals'
import { HEALTH } from '../domain/goals'
import { usePrefs } from '../i18n'

export function Button({ kind = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet' | 'danger' | 'ghost' }) {
  const look = {
    primary: 'bg-button text-on-brand hover:opacity-90',
    quiet: 'border border-line bg-card text-ink hover:bg-brand-soft',
    danger: 'border border-line bg-card text-late hover:bg-late-soft',
    ghost: 'text-muted hover:bg-brand-soft hover:text-ink',
  }[kind]
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[0.95rem] font-medium disabled:opacity-50 ${look} ${className}`}
    />
  )
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'block min-h-11 rounded-lg border border-line bg-card px-3 text-ink placeholder:text-muted/70 focus:border-button focus:outline-none'
/** Full width unless the caller sets its own width */
const cls = (extra = '') => `${inputClass} ${/(^|\s)w-/.test(extra) ? '' : 'w-full'} ${extra}`
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cls(p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cls(`py-2 ${p.className ?? ''}`)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cls(p.className)} />

/** Numbers typed freely (Arabic digits and comma accepted) */
export function NumberInput({ value, onChange, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | ''; onChange: (n: number | '') => void }) {
  return (
    <Input
      {...p}
      inputMode="decimal"
      value={value}
      onChange={(e) => {
        const s = e.target.value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.').replace(',', '.')
        if (s === '' || s === '-') return onChange('')
        const n = Number(s)
        if (!Number.isNaN(n)) onChange(n)
      }}
      className={`num ${p.className ?? ''}`}
    />
  )
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium ${value === o.value ? 'bg-button text-on-brand' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => (e.preventDefault(), onClose())}
      className={`m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-hidden rounded-xl border border-line bg-card p-0 text-ink backdrop:bg-black/45`}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={id} className="text-lg font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-brand-soft" aria-label="✕">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  )
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {children && <div className="no-print flex flex-wrap gap-2">{children}</div>}
    </header>
  )
}

/** A titled white sheet. Sections differ by content, not by decoration. */
export function Sheet({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="font-bold">{title}</h2>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-muted">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

const HEALTH_LOOK: Record<Health, [string, typeof CheckCircle2]> = {
  done: ['bg-good-soft text-good', CheckCircle2],
  on_track: ['bg-good-soft text-good', CheckCircle2],
  at_risk: ['bg-warn-soft text-warn', AlertTriangle],
  late: ['bg-late-soft text-late', XCircle],
  not_started: ['bg-sunk text-muted', CircleDashed],
  cancelled: ['bg-sunk text-muted', Clock],
}
/** Status always carries an icon and a word, never colour alone */
export function HealthBadge({ health }: { health: Health }) {
  const { tl } = usePrefs()
  const [cls, Icon] = HEALTH_LOOK[health]
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon size={13} aria-hidden />
      {tl(HEALTH[health])}
    </span>
  )
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'brand' | 'good' | 'warn' | 'late' }) {
  const cls = { muted: 'bg-sunk text-muted', brand: 'bg-brand-soft text-ink', good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', late: 'bg-late-soft text-late' }[tone]
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const parts = name.replace(/^(ال)/, '').split(' ').filter(Boolean)
  const initials = (parts[0]?.[0] ?? '') + (parts[1]?.replace(/^ال/, '')[0] ?? '')
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

/** A thin progress meter: actual fill + a marker where it should be by now */
export function Meter({ value, expected, label }: { value: number; expected?: number; label: string }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-track-empty" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="absolute inset-y-0 start-0 rounded-full bg-track" style={{ width: `${Math.min(100, value * 100)}%` }} />
      {expected != null && <div className="absolute -inset-y-1 w-0.5 rounded bg-ink/70" style={{ insetInlineStart: `calc(${Math.min(100, expected * 100)}% - 1px)` }} />}
    </div>
  )
}

/** Big figures in one band separated by rules (not a row of identical cards) */
export function Figures({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-card lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className={`px-4 py-4 ${i % 2 ? 'border-s border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-s' : ''}`}>
          <div className="text-sm text-muted">{it.label}</div>
          <div className="num mt-1 text-3xl font-bold leading-none">{it.value}</div>
          {it.note && <div className="mt-2 text-xs text-muted">{it.note}</div>}
        </div>
      ))}
    </div>
  )
}
