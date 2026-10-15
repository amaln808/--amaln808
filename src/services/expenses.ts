import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import type { Expense, ExpenseCategory, ID, PaymentMethod } from '../db/types'
import { UserError } from './errors'

export interface ExpenseInput {
  categoryId: ID
  date: string
  amountBaisa: number
  method: PaymentMethod
  description?: string
}

function validate(input: ExpenseInput) {
  if (!input.categoryId) throw new UserError('اختر التصنيف')
  if (!input.date) throw new UserError('اختر التاريخ')
  if (!(input.amountBaisa > 0)) throw new UserError('أدخل مبلغاً أكبر من صفر')
}

/** Expenses don't touch stock, so they can be edited freely. */
export async function saveExpense(db: FactoryDB, input: ExpenseInput, id?: ID): Promise<ID> {
  validate(input)
  const data = { ...input, description: input.description?.trim() || undefined }
  return db.transaction('rw', db.expenses, db.expenseCategories, async () => {
    if (!(await db.expenseCategories.get(input.categoryId))) throw new UserError('التصنيف غير موجود')
    if (id) {
      const existing = await db.expenses.get(id)
      if (!existing) throw new UserError('المصروف غير موجود')
      await db.expenses.put({ ...existing, ...data, updatedAt: new Date().toISOString() })
      return id
    }
    const e: Expense = newRecord(data)
    await db.expenses.add(e)
    return e.id
  })
}

export async function deleteExpense(db: FactoryDB, id: ID): Promise<void> {
  await db.expenses.delete(id)
}

export async function saveCategory(db: FactoryDB, input: { name: string; color?: string }, id?: ID): Promise<ID> {
  const name = input.name.trim()
  if (!name) throw new UserError('اسم التصنيف مطلوب')
  return db.transaction('rw', db.expenseCategories, async () => {
    const clash = await db.expenseCategories.where('name').equals(name).first()
    if (clash && clash.id !== id) throw new UserError('يوجد تصنيف بنفس الاسم')
    if (id) {
      const existing = await db.expenseCategories.get(id)
      if (!existing) throw new UserError('التصنيف غير موجود')
      await db.expenseCategories.put({ ...existing, name, color: input.color ?? existing.color, updatedAt: new Date().toISOString() })
      return id
    }
    const c: ExpenseCategory = newRecord({ name, color: input.color, isDefault: false })
    await db.expenseCategories.add(c)
    return c.id
  })
}

export async function deleteCategory(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', db.expenseCategories, db.expenses, async () => {
    const used = await db.expenses.where('categoryId').equals(id).count()
    if (used) throw new UserError(`لا يمكن حذف تصنيف عليه ${used} مصروف — انقلها لتصنيف آخر أولاً`)
    await db.expenseCategories.delete(id)
  })
}
