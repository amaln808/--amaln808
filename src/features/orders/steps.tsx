import { Check } from 'lucide-react'
import type { OrderStep } from '../../data/orders'
import { type StepKind, type StepState, stepState } from '../../domain/orders'
import { t } from '../../i18n/index'

export function stepKindLabel(k: StepKind): string {
  return {
    quote: t('عرض الأسعار', 'Quotation'),
    approval: t('موافقة العميل', 'Customer approval'),
    production: t('التصنيع', 'Production'),
    delivery: t('التوصيل', 'Delivery'),
    payment: t('دفعة مالية', 'Payment'),
    other: t('مرحلة', 'Stage'),
  }[k]
}

export function stateLabel(s: StepState): string {
  return {
    done: t('تمت', 'Done'),
    late: t('متأخرة', 'Late'),
    soon: t('قريباً', 'Soon'),
    planned: t('مجدولة', 'Planned'),
    open: t('بلا تاريخ', 'No date'),
  }[s]
}

/** Dot colour per state: done green, late red, soon amber, others neutral. */
export const DOT: Record<StepState, string> = {
  done: 'border-palm bg-palm text-white',
  late: 'border-red-600 bg-red-50 text-red-700',
  soon: 'border-amber-500 bg-amber-50 text-amber-800',
  planned: 'border-brand-500 bg-card text-brand-800',
  open: 'border-line bg-card text-muted',
}

/** «5/11» — day and month, for the narrow stepper */
export const shortDate = (d: string) => {
  const [, m, dd] = d.split('-')
  return `${Number(dd)}/${Number(m)}`
}

/** The date a stage shows: when it was done, or when it is planned. */
export const stepDate = (s: OrderStep) => s.doneDate ?? s.plannedDate

/**
 * The stages of an order as a row of numbered dots with their dates — read at
 * a glance on the orders list. Scrolls sideways on a phone.
 */
export function Stepper({ steps, today }: { steps: OrderStep[]; today: string }) {
  return (
    <ol className="-mx-1 flex overflow-x-auto px-1 pb-1">
      {steps.map((s, i) => {
        const st = stepState(s, today)
        const d = stepDate(s)
        return (
          <li key={s.id} className="relative flex min-w-[5.5rem] flex-1 flex-col items-center text-center">
            {i > 0 && <span className={`absolute end-1/2 top-3.5 h-0.5 w-full ${steps[i - 1].doneDate ? 'bg-palm' : 'bg-line'}`} aria-hidden />}
            <span className={`relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold ${DOT[st]}`}>
              {st === 'done' ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="mt-1 line-clamp-2 px-1 text-xs leading-tight">{s.title}</span>
            <span className={`num text-[0.7rem] ${st === 'late' ? 'font-bold text-red-700' : 'text-muted'}`}>{d ? shortDate(d) : '—'}</span>
          </li>
        )
      })}
    </ol>
  )
}
