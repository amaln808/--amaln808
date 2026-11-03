import { daysBetween } from './aging'

/** Stages of a customer order, from the quotation to the last payment. */
export type StepKind = 'quote' | 'approval' | 'production' | 'delivery' | 'payment' | 'other'

export interface StepLike {
  kind: StepKind
  plannedDate: string | null
  doneDate: string | null
  amountBaisa: number | null
  sortOrder: number
}

/** done · late (planned date passed) · soon (within 3 days) · planned · open (no date yet) */
export type StepState = 'done' | 'late' | 'soon' | 'planned' | 'open'

export const SOON_DAYS = 3

export function stepState(s: Pick<StepLike, 'plannedDate' | 'doneDate'>, today: string): StepState {
  if (s.doneDate) return 'done'
  if (!s.plannedDate) return 'open'
  const d = daysBetween(today, s.plannedDate)
  return d < 0 ? 'late' : d <= SOON_DAYS ? 'soon' : 'planned'
}

/** How far an order has come: stages done, the next one, late ones, and the payments planned and received. */
export function orderProgress<T extends StepLike>(steps: T[], today: string) {
  const sorted = [...steps].sort((a, b) => a.sortOrder - b.sortOrder)
  const done = sorted.filter((s) => s.doneDate).length
  const payments = sorted.filter((s) => s.kind === 'payment')
  return {
    done,
    total: sorted.length,
    next: sorted.find((s) => !s.doneDate) ?? null,
    late: sorted.filter((s) => stepState(s, today) === 'late'),
    plannedPayBaisa: payments.reduce((sum, s) => sum + (s.amountBaisa ?? 0), 0),
    paidBaisa: payments.filter((s) => s.doneDate).reduce((sum, s) => sum + (s.amountBaisa ?? 0), 0),
  }
}

/** Days from today to a date: negative when it has passed. */
export function daysUntil(date: string, today: string): number {
  return daysBetween(today, date)
}
