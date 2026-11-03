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

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
  product = (await one<{ id: string }>(`insert into items (type, name, unit) values ('finished', 'معجون 250', 'piece') returning id`)).id
}, 60_000)

describe('orders', () => {
  it('numbers a new order, creates the customer by name and the usual stages', async () => {
    const id = await rpc('create_order', json({ customer_name: 'جمعية الخير', product_id: product, qty: 500, order_date: '2026-11-03', due_date: '2026-12-01', amount_baisa: 550000 }))
    expect(await one(`select o.order_no, c.name, o.qty::text, o.due_date::text, o.status from orders o join customers c on c.id = o.customer_id where o.id = $1`, [id]))
      .toEqual({ order_no: 'O-0001', name: 'جمعية الخير', qty: '500.000', due_date: '2026-12-01', status: 'open' })
    const steps = await q<{ kind: string; planned_date: string | null }>(`select kind, planned_date::text from order_steps where order_id = $1 order by sort_order`, [id])
    expect(steps.map((s) => s.kind)).toEqual(['quote', 'approval', 'production', 'delivery', 'payment'])
    expect(steps.find((s) => s.kind === 'delivery')?.planned_date).toBe('2026-12-01')
    const second = await rpc('create_order', json({ customer_name: ' جمعية الخير ' }))
    expect((await one<{ order_no: string }>(`select order_no from orders where id = $1`, [second])).order_no).toBe('O-0002')
    expect((await q(`select 1 from customers`)).length).toBe(1)
  })

  it('accepting the linked quotation marks the approval stage done', async () => {
    const id = await rpc('create_order', json({ customer_name: 'عميل', product_id: product, qty: 10 }))
    const qid = await rpc('save_quotation', json({ customer_name: 'عميل', date: '2026-11-03', lines: [{ product_id: product, qty: 10, unit_price_baisa: 1500 }] }))
    await q(`update orders set quotation_id = $1 where id = $2`, [qid, id])
    expect(await one(`select done_date is not null as done from order_steps where order_id = $1 and kind = 'approval'`, [id])).toEqual({ done: false })
    // The test product has no sale permit, so set the status as accept_quotation would
    await q(`update quotations set status = 'accepted' where id = $1`, [qid])
    expect(await one(`select done_date is not null as done from order_steps where order_id = $1 and kind = 'approval'`, [id])).toEqual({ done: true })
  })

  it('is cleared by reset, included in backups, and hidden from non-members', async () => {
    await rpc('create_order', json({ customer_name: 'عميل' }))
    const tables = (await one<{ t: string[] }>('select public.backup_tables() as t')).t
    expect(tables).toEqual(expect.arrayContaining(['orders', 'order_steps']))
    expect(await queryAs(db, { role: 'anon' }, 'select * from orders').catch(() => [])).toEqual([])
    await q('select public.reset_all_data()')
    expect((await one<{ n: number }>('select count(*)::int as n from orders')).n).toBe(0)
    expect((await one<{ n: string }>(`select public.next_doc_no('order') as n`)).n).toBe('O-0001')
  })

  it('a payment stage keeps how it was paid and the receipt it was recorded as', async () => {
    const id = await rpc('create_order', json({ customer_name: 'عميل' }))
    const pay = (await one<{ id: string; customer_id: string }>(
      `insert into customer_payments (customer_id, date, amount_baisa, method) select customer_id, '2026-11-03', 275000, 'bank' from orders where id = $1 returning id`, [id])).id
    await q(`update order_steps set done_date = '2026-11-03', amount_baisa = 275000, method = 'bank', payment_id = $2 where order_id = $1 and kind = 'payment'`, [id, pay])
    expect(await one(`select method, payment_id = $2 as linked from order_steps where order_id = $1 and kind = 'payment'`, [id, pay])).toEqual({ method: 'bank', linked: true })
    await expect(q(`update order_steps set method = 'cheque' where order_id = $1`, [id])).rejects.toThrow()
  })

  it('receipts recorded for an order move onto its invoice when it gets one', async () => {
    const id = await rpc('create_order', json({ customer_name: 'عميل', product_id: product, qty: 10, amount_baisa: 200000 }))
    const pay = (await one<{ id: string }>(
      `insert into customer_payments (customer_id, date, amount_baisa, method) select customer_id, '2026-11-03', 100000, 'cash' from orders where id = $1 returning id`, [id])).id
    await q(`update order_steps set done_date = '2026-11-03', amount_baisa = 100000, payment_id = $2 where order_id = $1 and kind = 'payment'`, [id, pay])
    const qid = await rpc('save_quotation', json({ customer_name: 'عميل', date: '2026-11-03', lines: [{ product_id: product, qty: 10, unit_price_baisa: 20000 }] }))
    // Stands in for the invoice accept_quotation would issue (the test product has no sale permit)
    const inv = (await one<{ id: string }>(
      `insert into sales_invoices (invoice_no, customer_id, date, due_date, status, subtotal_baisa, total_baisa) select 'INV-T1', customer_id, '2026-11-04', '2026-11-19', 'issued', 200000, 200000 from orders where id = $1 returning id`, [id])).id
    await q(`update orders set quotation_id = $1 where id = $2`, [qid, id])
    await q(`update quotations set status = 'accepted', invoice_id = $2 where id = $1`, [qid, inv])
    expect(await one(`select invoice_id = $2 as linked from orders where id = $1`, [id, inv])).toEqual({ linked: true })
    expect(await one(`select invoice_id = $2 as moved from customer_payments where id = $1`, [pay, inv])).toEqual({ moved: true })
  })
})

