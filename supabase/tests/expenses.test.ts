import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUser, freshDb, queryAs, type Who } from './harness'

const OWNER = '11111111-1111-4111-8111-111111111111'
const owner: Who = { role: 'authenticated', userId: OWNER }
let db: PGlite

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => queryAs<T>(db, owner, sql, params)
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0]
const save = (p: Record<string, unknown>) => one<{ r: string }>('select public.save_expense($1) as r', [JSON.stringify(p)]).then((x) => x.r)

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
}, 60_000)

describe('expenses', () => {
  it('creates a typed supplier and category, and the supplier remembers the category', async () => {
    await save({ date: '2026-10-01', supplier_name: 'شركة الكهرباء', category_name: 'كهرباء', amount_baisa: 23450 })
    const s = await one<{ name: string; category: string }>(
      `select s.name, c.name as category from suppliers s join expense_categories c on c.id = s.last_expense_category_id`)
    expect(s).toEqual({ name: 'شركة الكهرباء', category: 'كهرباء' })
    // «كهرباء» is a default category, so no duplicate; a new one is created when typed
    await save({ date: '2026-10-02', supplier_name: 'شركة الكهرباء', category_name: 'غاز التشغيل', amount_baisa: 5000 })
    expect((await q(`select 1 from expense_categories where name in ('كهرباء', 'غاز التشغيل')`)).length).toBe(2)
    expect((await q('select 1 from suppliers')).length).toBe(1)
  })

  it('saving the same id again updates instead of adding (safe for the offline queue)', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    await save({ id, date: '2026-10-01', category_name: 'نقل', amount_baisa: 12000 })
    await save({ id, date: '2026-10-01', category_name: 'نقل', amount_baisa: 13000, notes: 'مصحح' })
    expect(await q<{ amount_baisa: string; notes: string }>('select amount_baisa::text, notes from expenses')).toEqual([{ amount_baisa: '13000', notes: 'مصحح' }])
  })

  it('refuses a missing amount or VAT above the amount', async () => {
    await expect(save({ category_name: 'نقل', amount_baisa: 0 })).rejects.toThrow(/المبلغ غير صحيح/)
    await expect(save({ category_name: 'نقل', amount_baisa: 100, vat_baisa: 200 })).rejects.toThrow(/الضريبة/)
  })

  it('demo factory includes expenses', async () => {
    await q('select public.load_demo_data()')
    expect(Number((await one<{ n: string }>('select count(*) as n from expenses')).n)).toBe(5)
  })
})
