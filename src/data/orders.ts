import type { StepKind } from '../domain/orders'
import type { PaymentMethod } from './inventory'
import { toCamel, toSnake } from './case'
import { db } from './client'
import { invalidate } from './useQuery'

export type OrderStatus = 'open' | 'done' | 'cancelled'

export interface OrderStep {
  id: string
  orderId: string
  kind: StepKind
  title: string
  plannedDate: string | null
  doneDate: string | null
  amountBaisa: number | null
  /** Payments: how it was paid, and the receipt recorded in the customer's account */
  method: PaymentMethod | null
  paymentId: string | null
  /** Production stage: the batch that made the order */
  batchId: string | null
  notes: string | null
  sortOrder: number
}

export interface Order {
  id: string
  orderNo: string
  customerId: string
  productId: string | null
  qty: number | null
  orderDate: string
  dueDate: string | null
  amountBaisa: number | null
  quotationId: string | null
  invoiceId: string | null
  status: OrderStatus
  notes: string | null
  steps: OrderStep[]
}

export const ORDERS_KEY = 'orders'

const num = (v: unknown) => (v == null ? null : Number(v))
const toStep = (r: Record<string, unknown>): OrderStep => {
  const s = toCamel(r) as unknown as OrderStep
  return { ...s, amountBaisa: num(s.amountBaisa), sortOrder: Number(s.sortOrder) }
}

/** Every order with its stages, newest first. */
export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await db().from('orders').select('*, order_steps(*)').order('order_date', { ascending: false }).order('order_no', { ascending: false })
  if (error) throw error
  return data.map((r) => {
    const { order_steps, ...rest } = r as Record<string, unknown>
    const o = toCamel(rest) as unknown as Order
    return {
      ...o,
      qty: num(o.qty),
      amountBaisa: num(o.amountBaisa),
      steps: ((order_steps as Record<string, unknown>[]) ?? []).map(toStep).sort((a, b) => a.sortOrder - b.sortOrder),
    }
  })
}

function changed() {
  invalidate(ORDERS_KEY)
}

export interface OrderDraft {
  customerId: string | null
  customerName: string
  productId: string | null
  qty: number | null
  orderDate: string
  dueDate: string | null
  amountBaisa: number | null
  notes: string | null
}

/** A new order with its usual stages; returns its id. */
export async function createOrder(d: OrderDraft): Promise<string> {
  const { data, error } = await db().rpc('create_order', {
    p: {
      customer_id: d.customerId,
      customer_name: d.customerName,
      product_id: d.productId,
      qty: d.qty,
      order_date: d.orderDate,
      due_date: d.dueDate,
      amount_baisa: d.amountBaisa,
      notes: d.notes,
    },
  })
  if (error) throw error
  changed()
  invalidate('sales')
  return data as string
}

export async function updateOrder(id: string, patch: Partial<Omit<Order, 'id' | 'orderNo' | 'steps'>>) {
  const { error } = await db().from('orders').update(toSnake(patch)).eq('id', id)
  if (error) throw error
  changed()
}

export async function deleteOrder(id: string) {
  const { error } = await db().from('orders').delete().eq('id', id)
  if (error) throw error
  changed()
}

export async function saveStep(s: Partial<OrderStep> & { orderId: string }) {
  const { id, ...rest } = s
  const row = toSnake(rest as Record<string, unknown>)
  const { error } = id ? await db().from('order_steps').update(row).eq('id', id) : await db().from('order_steps').insert(row)
  if (error) throw error
  changed()
}

export async function deleteStep(id: string) {
  const { error } = await db().from('order_steps').delete().eq('id', id)
  if (error) throw error
  changed()
}

/** A quotation made for an order: link it, and its «quotation» stage is done that day. */
export async function linkQuotation(orderId: string, quotationId: string, date: string) {
  const r1 = await db().from('orders').update({ quotation_id: quotationId }).eq('id', orderId)
  if (r1.error) throw r1.error
  const r2 = await db().from('order_steps').update({ done_date: date }).eq('order_id', orderId).eq('kind', 'quote').is('done_date', null)
  if (r2.error) throw r2.error
  changed()
}

/** A production batch made for an order: its production stage is done that day and points at it. */
export async function linkBatch(orderId: string, batchId: string, date: string) {
  const { error } = await db().from('order_steps').update({ batch_id: batchId, done_date: date }).eq('order_id', orderId).eq('kind', 'production')
  if (error) throw error
  changed()
}
