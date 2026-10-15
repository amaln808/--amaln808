import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactoryDB } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { UserError } from './errors'
import { deleteCategory, deleteExpense, saveCategory, saveExpense } from './expenses'

let db: FactoryDB
let n = 0
beforeEach(async () => {
  db = new FactoryDB(`phase4-${n++}`)
  await seedIfEmpty(db)
})
afterEach(() => db.close())

const cat = async (name: string) => (await db.expenseCategories.where('name').equals(name).first())!.id

describe('expenses', () => {
  it('records, edits and deletes expenses', async () => {
    const rent = await cat('إيجار')
    const id = await saveExpense(db, { categoryId: rent, date: '2026-10-01', amountBaisa: 150000, method: 'bank', description: ' إيجار أكتوبر ' })
    expect(await db.expenses.get(id)).toMatchObject({ amountBaisa: 150000, description: 'إيجار أكتوبر' })

    await saveExpense(db, { categoryId: rent, date: '2026-10-01', amountBaisa: 160000, method: 'bank' }, id)
    expect((await db.expenses.get(id))!.amountBaisa).toBe(160000)
    expect(await db.expenses.count()).toBe(1)

    await expect(saveExpense(db, { categoryId: rent, date: '2026-10-01', amountBaisa: 0, method: 'cash' })).rejects.toThrow(UserError)
    await expect(saveExpense(db, { categoryId: 'nope', date: '2026-10-01', amountBaisa: 1, method: 'cash' })).rejects.toThrow(UserError)

    await deleteExpense(db, id)
    expect(await db.expenses.count()).toBe(0)
  })

  it('manages categories and protects used ones', async () => {
    const id = await saveCategory(db, { name: 'تغليف خارجي', color: '#123456' })
    await expect(saveCategory(db, { name: 'إيجار' })).rejects.toThrow(/بنفس الاسم/)
    await saveCategory(db, { name: 'شحن' }, id)
    expect((await db.expenseCategories.get(id))!.name).toBe('شحن')

    await saveExpense(db, { categoryId: id, date: '2026-10-02', amountBaisa: 5000, method: 'cash' })
    await expect(deleteCategory(db, id)).rejects.toThrow(UserError)
    await db.expenses.clear()
    await deleteCategory(db, id)
    expect(await db.expenseCategories.get(id)).toBeUndefined()
  })
})
