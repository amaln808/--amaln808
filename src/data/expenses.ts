import { toCamel } from './case'
import { db } from './client'
import { uploadFile } from './files'
import { type PaymentMethod, SUPPLIERS_KEY } from './inventory'
import { enqueue, flushOutbox, registerOutboxHandler } from './outbox'
import { invalidate } from './useQuery'

export interface ExpenseCategory {
  id: string
  name: string
  nameEn: string | null
  color: string | null
  isDefault: boolean
}

export interface Expense {
  id: string
  date: string
  categoryId: string
  supplierId: string | null
  amountBaisa: number
  vatBaisa: number
  method: PaymentMethod
  receiptPath: string | null
  ocrText: string | null
  notes: string | null
}

export const EXPENSES_KEY = 'expenses'

/** Every expense with its categories and the suppliers that can be picked. */
export async function fetchExpenses() {
  const [e, c, s] = await Promise.all([
    db().from('expenses').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }),
    db().from('expense_categories').select('*').order('name'),
    db().from('suppliers').select('id, name, active, last_expense_category_id').order('name'),
  ])
  for (const r of [e, c, s]) if (r.error) throw r.error
  return {
    expenses: e.data!.map((r) => {
      const x = toCamel(r) as unknown as Expense
      return { ...x, amountBaisa: Number(x.amountBaisa), vatBaisa: Number(x.vatBaisa) }
    }),
    categories: c.data!.map((r) => toCamel(r) as unknown as ExpenseCategory),
    suppliers: s.data!.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      active: r.active as boolean,
      lastCategoryId: r.last_expense_category_id as string | null,
    })),
  }
}
export type ExpensesData = Awaited<ReturnType<typeof fetchExpenses>>

export interface ExpenseDraft {
  date: string
  /** Typed or picked; a new name becomes a supplier / category on save */
  supplierName: string
  categoryName: string
  amountBaisa: number
  vatBaisa: number
  method: PaymentMethod
  notes: string | null
  ocrText: string | null
  /** Kept path when editing; replaced when a new photo is attached */
  receiptPath: string | null
}

interface ExpensePayload extends ExpenseDraft {
  /** The expense row id: stays the same when the same save is sent twice */
  expenseId: string
  /** Compressed photo waiting to be uploaded with the expense */
  photo?: Blob
}

// Expenses (with their photo) can be recorded offline. The expense id is fixed
// before queueing (and names the photo), so sending twice changes nothing.
registerOutboxHandler<ExpensePayload>('expense.save', async (p) => {
  let receiptPath = p.receiptPath
  if (p.photo) receiptPath = await uploadFile('receipts', `expenses/${p.expenseId}.jpg`, p.photo)
  const { error } = await db().rpc('save_expense', {
    p: {
      id: p.expenseId,
      date: p.date,
      supplier_name: p.supplierName.trim() || null,
      category_name: p.categoryName,
      amount_baisa: p.amountBaisa,
      vat_baisa: p.vatBaisa,
      method: p.method,
      receipt_path: receiptPath,
      ocr_text: p.ocrText,
      notes: p.notes,
    },
  })
  if (error) throw error
  invalidate(EXPENSES_KEY)
  invalidate(SUPPLIERS_KEY)
})

/** New expense, or an edit when id is given. Works offline (sent when back online). */
export async function saveExpense(d: ExpenseDraft, opts: { id?: string; photo?: Blob } = {}) {
  await enqueue('expense.save', { ...d, photo: opts.photo, expenseId: opts.id ?? crypto.randomUUID() })
  await flushOutbox()
  invalidate(EXPENSES_KEY)
}

export async function deleteExpense(id: string) {
  const { error } = await db().from('expenses').delete().eq('id', id)
  if (error) throw error
  invalidate(EXPENSES_KEY)
}

export async function renameCategory(id: string, name: string) {
  const { error } = await db().from('expense_categories').update({ name }).eq('id', id)
  if (error) throw error
  invalidate(EXPENSES_KEY)
}
