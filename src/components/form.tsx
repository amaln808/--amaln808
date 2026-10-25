import {
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useContext,
  useId,
  useState,
} from 'react'
import { nameKey } from '../domain/text'

/** Lets a control inside <Field> pick up the id its label points to. */
const FieldId = createContext<string | undefined>(undefined)
const useFieldId = (id?: string) => id ?? useContext(FieldId)

const inputCls =
  'w-full min-h-12 rounded-xl border border-line bg-card px-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50'

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
      </label>
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId(props.id)
  return <input type="text" {...props} id={id} className={`${inputCls} ${props.className ?? ''}`} />
}

/**
 * Text input with a decimal keypad. Kept as text so Arabic digits can be typed;
 * the caller parses the value with parseRialToBaisa / parseQty.
 */
export function NumberInput({ suffix, ...props }: InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  const id = useFieldId(props.id)
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        {...props}
        id={id}
        className={`${inputCls} num ${suffix ? 'pe-14' : ''} ${props.className ?? ''}`}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-muted">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useFieldId(props.id)
  return <select {...props} id={id} className={`${inputCls} ${props.className ?? ''}`} />
}

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const id = useFieldId(props.id)
  return <input type="date" {...props} id={id} className={`${inputCls} ${props.className ?? ''}`} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useFieldId(props.id)
  return <textarea rows={2} {...props} id={id} className={`${inputCls} py-2 ${props.className ?? ''}`} />
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>
}

/** Segmented control for 2–4 options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="flex rounded-xl bg-stone-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-lg px-3 text-sm transition ${
            value === o.value ? 'bg-card font-bold text-brand-800' : 'text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Free-text input that offers earlier entries as choices. Anything typed is
 * accepted; when it matches no choice the field is marked «جديد».
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  newLabel,
}: {
  value: string
  onChange: (text: string) => void
  options: Array<{ label: string; hint?: string }>
  placeholder?: string
  /** Badge shown when the text is not one of the options; omit to hide it. */
  newLabel?: string
}) {
  const id = useFieldId()
  const [open, setOpen] = useState(false)
  const q = nameKey(value)
  const exact = options.some((o) => nameKey(o.label) === q)
  const shown = exact ? options : options.filter((o) => nameKey(o.label).includes(q))
  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => (onChange(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`${inputCls} ${newLabel && q && !exact ? 'pe-16' : ''}`}
      />
      {newLabel && q && !exact && (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-800">{newLabel}</span>
        </span>
      )}
      {open && shown.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-lg">
          {shown.map((o) => (
            <li key={o.label}>
              <button
                type="button"
                // mousedown fires before the input's blur, so the choice registers
                onMouseDown={(e) => (e.preventDefault(), onChange(o.label), setOpen(false))}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-start hover:bg-brand-50 ${
                  nameKey(o.label) === q ? 'font-bold text-brand-800' : ''
                }`}
              >
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
