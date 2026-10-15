import { t } from '../i18n/index'
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
  if (!input.categoryId) throw new UserError(t("اختر التصنيف", "Choose a category"))
  if (!input.date) throw new UserError(t("اختر التاريخ", "Choose a date"))
  if (!(input.amountBaisa > 0)) throw new UserError(t("أدخل مبلغاً أكبر من صفر", "Enter an amount greater than zero"))
}

/** Expenses don't touch stock, so they can be edited freely. */
export async function saveExpense(db: FactoryDB, input: ExpenseInput, id?: ID): Promise<ID> {
  validate(input)
  const data = { ...input, description: input.description?.trim() || undefined }
  return db.transaction('rw', db.expenses, db.expenseCategories, async () => {
    if (!(await db.expenseCategories.get(input.categoryId))) throw new UserError(t("التصنيف غير موجود", "Category not found"))
    if (id) {
      const existing = await db.expenses.get(id)
      if (!existing) throw new UserError(t("المصروف غير موجود", "Expense not found"))
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

export async function saveCategory(db: FactoryDB, input: { name: string; nameEn?: string; color?: string }, id?: ID): Promise<ID> {
  const name = input.name.trim()
  if (!name) throw new UserError(t("اسم التصنيف مطلوب", "Category name is required"))
  return db.transaction('rw', db.expenseCategories, async () => {
    const clash = await db.expenseCategories.where('name').equals(name).first()
    if (clash && clash.id !== id) throw new UserError(t("يوجد تصنيف بنفس الاسم", "A category with this name exists"))
    if (id) {
      const existing = await db.expenseCategories.get(id)
      if (!existing) throw new UserError(t("التصنيف غير موجود", "Category not found"))
      await db.expenseCategories.put({
        ...existing,
        name,
        nameEn: input.nameEn !== undefined ? input.nameEn.trim() || undefined : existing.nameEn,
        color: input.color ?? existing.color,
        updatedAt: new Date().toISOString(),
      })
      return id
    }
    const c: ExpenseCategory = newRecord({ name, nameEn: input.nameEn?.trim() || undefined, color: input.color, isDefault: false })
    await db.expenseCategories.add(c)
    return c.id
  })
}

export async function deleteCategory(db: FactoryDB, id: ID): Promise<void> {
  await db.transaction('rw', db.expenseCategories, db.expenses, async () => {
    const used = await db.expenses.where('categoryId').equals(id).count()
    if (used) throw new UserError(t(`لا يمكن حذف تصنيف عليه ${used} مصروف — انقلها لتصنيف آخر أولاً`, `Can't delete a category with ${used} expense(s) — move them to another category first`))
    await db.expenseCategories.delete(id)
  })
}
