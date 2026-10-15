import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { isRTL } from '../i18n/index'

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-2 inline-flex min-h-9 items-center text-sm text-brand-700">
          {isRTL() ? '→' : '←'} {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
          {subtitle && <div className="mt-1 text-stone-500">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-8" />
      </div>
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="max-w-sm text-stone-500">{description}</p>}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-700 hover:bg-stone-100',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-medium transition-colors disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function LinkButton({
  variant = 'primary',
  className = '',
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 font-medium transition-colors ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'red' | 'green' }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-stone-900'
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`num mt-1 text-lg font-bold sm:text-xl ${color}`} style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'red' | 'green' | 'amber' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    red: 'bg-red-100 text-red-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
  }
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}
