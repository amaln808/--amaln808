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

export interface OrderBalanceLike {
  id: string
  orderNo: string
  customerId: string
  status: 'open' | 'done' | 'cancelled'
  invoiceId: string | null
  amountBaisa: number | null
  dueDate: string | null
  steps: Array<StepLike & { paymentId?: string | null }>
}

/**
 * What customers still owe on orders agreed but not invoiced yet: the agreed
 * value less the payments received for it. When the order is invoiced, the
 * invoice takes over (and its receipts move onto it), so it is not counted here.
 * Due on the next payment planned, else on the delivery date.
 */
export function orderReceivables(orders: OrderBalanceLike[], today: string) {
  return orders
    .filter((o) => o.status !== 'cancelled' && !o.invoiceId && o.amountBaisa != null && o.amountBaisa > 0)
    .map((o) => {
      const payments = o.steps.filter((s) => s.kind === 'payment')
      const received = payments.filter((s) => s.doneDate).reduce((sum, s) => sum + (s.amountBaisa ?? 0), 0)
      const leftBaisa = Math.max(0, o.amountBaisa! - received)
      const pending = payments.filter((s) => !s.doneDate && s.plannedDate).sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!))
      const latePlanned = pending.filter((s) => s.plannedDate! < today).reduce((sum, s) => sum + (s.amountBaisa ?? 0), 0)
      const pastDelivery = !pending.length && !!o.dueDate && o.dueDate < today
      return {
        orderId: o.id,
        orderNo: o.orderNo,
        customerId: o.customerId,
        leftBaisa,
        dueDate: pending[0]?.plannedDate ?? o.dueDate,
        overdueBaisa: Math.min(leftBaisa, pastDelivery ? leftBaisa : latePlanned),
        paymentIds: o.steps.map((s) => s.paymentId).filter((x): x is string => !!x),
      }
    })
    .filter((r) => r.leftBaisa > 0 || r.paymentIds.length > 0)
}
