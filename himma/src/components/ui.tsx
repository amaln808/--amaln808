import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Scope } from '../domain/performance'
import { SCOPE } from '../format'

export function Button({
  kind = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet' | 'danger' }) {
  const look = {
    primary: 'bg-button text-on-brand hover:opacity-90',
    quiet: 'border border-line bg-card text-ink hover:bg-brand-soft',
    danger: 'border border-line bg-card text-late hover:bg-brand-soft',
  }[kind]
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium disabled:opacity-50 ${look} ${className}`}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'block min-h-11 w-full rounded-xl border border-line bg-card px-3 text-ink placeholder:text-muted/70 focus:border-button focus:outline-none'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

/** Free text with earlier values offered as choices. */
export function Suggest({ options, ...props }: InputHTMLAttributes<HTMLInputElement> & { options: string[] }) {
  const id = useId()
  return (
    <>
      <Input list={id} autoComplete="off" {...props} />
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${value === o.value ? 'bg-button text-on-brand' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ScopeTag({ scope }: { scope: Scope }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className={`size-2 rounded-full ${scope === 'work' ? 'bg-work' : 'bg-personal'}`} aria-hidden />
      {SCOPE[scope]}
    </span>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(36rem,calc(100%-1.5rem))] rounded-2xl border border-line bg-card p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="إغلاق" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-brand-soft">
          <X size={20} />
        </button>
      </div>
      <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  )
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">{children}</p>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="mt-3 text-sm text-late">{children}</p> : null
}
