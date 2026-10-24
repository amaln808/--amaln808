import { addDays } from 'date-fns'
import { iso, type Recurrence } from '../domain/schedule'
import { toCamel, toSnake } from './case'
import { db } from './client'
import { enqueue, flushOutbox, registerOutboxHandler } from './outbox'
import { invalidate } from './useQuery'

export type TaskCategory = 'general' | 'production' | 'quality' | 'cleaning' | 'inventory' | 'maintenance' | 'finance' | 'admin'
export type AgreementKind = 'product_permit' | 'contract' | 'license' | 'other'

export interface Task {
  id: string
  title: string
  notes: string | null
  category: TaskCategory
  recurrence: Recurrence
  intervalN: number
  startDate: string
  endDate: string | null
  weekdays: number[]
  dueTime: string | null
  agreementId: string | null
  active: boolean
}

export interface Agreement {
  id: string
  kind: AgreementKind
  title: string
  party: string | null
  productId: string | null
  referenceNo: string | null
  startDate: string | null
  endDate: string
  alertDays: number
  amountBaisa: number | null
  filePath: string | null
  notes: string | null
  renewedById: string | null
  active: boolean
}

export interface ProductOption {
  id: string
  name: string
  nameEn: string | null
}

export interface ScheduleBundle {
  tasks: Task[]
  /** "taskId|YYYY-MM-DD" of finished occurrences */
  done: string[]
  agreements: Agreement[]
  products: ProductOption[]
}

export const SCHEDULE_KEY = 'schedule'

export async function fetchSchedule(): Promise<ScheduleBundle> {
  const since = iso(addDays(new Date(), -400))
  const [tasks, done, agreements, products] = await Promise.all([
    db().from('tasks').select('*').order('start_date'),
    db().from('task_completions').select('task_id, due_date').gte('due_date', since),
    db().from('agreements').select('*').order('end_date'),
    db().from('items').select('id, name, name_en').eq('type', 'finished').eq('active', true).order('name'),
  ])
  for (const r of [tasks, done, agreements, products]) if (r.error) throw r.error
  return {
    tasks: tasks.data!.map((r) => toCamel(r) as unknown as Task),
    done: done.data!.map((r) => `${r.task_id}|${r.due_date}`),
    agreements: agreements.data!.map((r) => ({ ...(toCamel(r) as unknown as Agreement), amountBaisa: r.amount_baisa === null ? null : Number(r.amount_baisa) })),
    products: products.data!.map((r) => toCamel(r) as unknown as ProductOption),
  }
}

export async function saveTask(task: Omit<Task, 'id'> & { id?: string }) {
  const row = toSnake({ ...task })
  const { error } = task.id ? await db().from('tasks').update(row).eq('id', task.id) : await db().from('tasks').insert(row)
  if (error) throw error
  invalidate(SCHEDULE_KEY)
}

export async function deleteTask(id: string) {
  const { error } = await db().from('tasks').delete().eq('id', id)
  if (error) throw error
  invalidate(SCHEDULE_KEY)
}

interface CompletePayload {
  taskId: string
  dueDate: string
}

// Ticking a task works offline: it waits in the outbox and is sent later.
// The outbox id becomes the row id, and (task, date) is unique, so a resend is harmless.
registerOutboxHandler<CompletePayload>('task.complete', async (p, entry) => {
  const { error } = await db()
    .from('task_completions')
    .upsert({ id: entry.id, task_id: p.taskId, due_date: p.dueDate }, { onConflict: 'task_id,due_date', ignoreDuplicates: true })
  if (error) throw error
  invalidate(SCHEDULE_KEY)
})

export async function completeTask(taskId: string, dueDate: string) {
  await enqueue('task.complete', { taskId, dueDate } satisfies CompletePayload)
  await flushOutbox()
}

export async function uncompleteTask(taskId: string, dueDate: string) {
  const { error } = await db().from('task_completions').delete().eq('task_id', taskId).eq('due_date', dueDate)
  if (error) throw error
  invalidate(SCHEDULE_KEY)
}

export async function saveAgreement(a: Omit<Agreement, 'id' | 'renewedById'> & { id?: string }): Promise<string> {
  const row = toSnake({ ...a })
  const q = a.id ? db().from('agreements').update(row).eq('id', a.id) : db().from('agreements').insert(row)
  const { data, error } = await q.select('id').single()
  if (error) throw error
  invalidate(SCHEDULE_KEY)
  return data.id as string
}

/** Saves the renewed agreement and retires the old one (kept as history). */
export async function renewAgreement(oldId: string, next: Omit<Agreement, 'id' | 'renewedById' | 'active'>) {
  const newId = await saveAgreement({ ...next, active: true })
  const { error } = await db().from('agreements').update({ renewed_by_id: newId, active: false }).eq('id', oldId)
  if (error) throw error
  invalidate(SCHEDULE_KEY)
}

export async function deleteAgreement(id: string) {
  const { error } = await db().from('agreements').delete().eq('id', id)
  if (error) throw error
  invalidate(SCHEDULE_KEY)
}

/** Today on this device (Oman local time). */
export const todayIso = () => iso(new Date())
