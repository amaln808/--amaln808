import {
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useContext,
  useId,
} from 'react'

/** Lets a control inside <Field> pick up the id its label points to. */
const FieldId = createContext<string | undefined>(undefined)
const useFieldId = (id?: string) => id ?? useContext(FieldId)

const inputCls =
  'w-full min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50'

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
      {hint && <span className="text-xs text-stone-500">{hint}</span>}
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
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-stone-500">
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
            value === o.value ? 'bg-white font-bold text-brand-800 shadow-sm' : 'text-stone-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
