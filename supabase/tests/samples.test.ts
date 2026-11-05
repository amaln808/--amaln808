import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUser, freshDb, queryAs, type Who } from './harness'

const OWNER = '11111111-1111-4111-8111-111111111111'
const owner: Who = { role: 'authenticated', userId: OWNER }
let db: PGlite

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => queryAs<T>(db, owner, sql, params)
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0]
const rpc = (fn: string, ...args: unknown[]) =>
  one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(', ')}) as r`, args).then((x) => (x as { r: unknown }).r)
const json = (v: unknown) => JSON.stringify(v)

let product: string
const lot = (code: string, expiry: string, qty: number, cost: number) =>
  one<{ id: string }>(
    `insert into stock_lots (item_id, lot_code, source_type, received_date, expiry_date, qty_in, qty_remaining, unit_cost_baisa, qc_status)
     values ($1, $2, 'production', '2026-10-01', $3, $4, $4, $5, 'passed') returning id`,
    [product, code, expiry, qty, cost],
  ).then((r) => r.id)
const remaining = async (id: string) => Number((await one<{ q: string }>(`select qty_remaining as q from stock_lots where id = $1`, [id])).q)

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
  product = (await one<{ id: string }>(`insert into items (type, name, unit) values ('finished', 'معجون 250', 'piece') returning id`)).id
}, 60_000)

describe('promotional samples', () => {
  it('takes the jars from ready stock, nearest expiry first, and keeps their cost', async () => {
    const early = await lot('B-0001', '2027-03-01', 4, 800)
    const late = await lot('B-0002', '2027-06-01', 50, 900)
    const id = await rpc('give_samples', json({ product_id: product, qty: 10, recipient: 'معرض الغذاء', date: '2026-11-05', notes: 'تعريف بالمنتج' }))
    // 4 × 0.800 + 6 × 0.900 = 8.600
    expect(await one(`select recipient, qty::text, cost_baisa::int, customer_id from samples where id = $1`, [id]))
      .toEqual({ recipient: 'معرض الغذاء', qty: '10.000', cost_baisa: 8600, customer_id: null })
    expect([await remaining(early), await remaining(late)]).toEqual([0, 44])
    const moves = await q<{ type: string; qty: string }>(`select type, qty::text from stock_movements where ref_type = 'sample' and ref_id = $1 order by qty`, [id])
    expect(moves).toEqual([{ type: 'sample', qty: '-4.000' }, { type: 'sample', qty: '-6.000' }])
  })

  it('links a saved customer by name, refuses more than there is, and returns the jars when deleted', async () => {
    const l = await lot('B-0001', '2027-03-01', 20, 800)
    const cust = (await one<{ id: string }>(`insert into customers (name) values ('صيدلية الشفاء') returning id`)).id
    const id = await rpc('give_samples', json({ product_id: product, qty: 5, recipient: ' صيدلية الشفاء ' }))
    expect((await one<{ customer_id: string }>(`select customer_id from samples where id = $1`, [id])).customer_id).toBe(cust)
    await expect(rpc('give_samples', json({ product_id: product, qty: 50, recipient: 'x' }))).rejects.toThrow(/غير كافية/)
    await expect(rpc('give_samples', json({ product_id: product, qty: 1, recipient: ' ' }))).rejects.toThrow(/استلمت/)
    expect(await remaining(l)).toBe(15)
    await rpc('delete_samples', id)
    expect(await remaining(l)).toBe(20)
    expect((await q(`select 1 from stock_movements where ref_type = 'sample'`)).length).toBe(0)
    expect((await q(`select 1 from samples`)).length).toBe(0)
  })

  it('is in backups, cleared by reset, and hidden from non-members', async () => {
    await lot('B-0001', '2027-03-01', 5, 800)
    await rpc('give_samples', json({ product_id: product, qty: 1, recipient: 'x' }))
    expect((await one<{ t: string[] }>('select public.backup_tables() as t')).t).toContain('samples')
    expect(await queryAs(db, { role: 'anon' }, 'select * from samples').catch(() => [])).toEqual([])
    await q('select public.reset_all_data()')
    expect((await one<{ n: number }>('select count(*)::int as n from samples')).n).toBe(0)
  })
})
