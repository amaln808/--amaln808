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
let jar: string
let customer: string

/** A product with a permit, a jar, a customer, and two produced batches (B-0001 older expiry, B-0002 later). */
beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
  product = (await one<{ id: string }>(`insert into items (type, name, unit, shelf_life_days) values ('finished', 'معجون 250', 'piece', 180) returning id`)).id
  jar = (await one<{ id: string }>(`insert into items (type, name, unit) values ('packaging', 'علبة', 'piece') returning id`)).id
  await rpc('add_opening_stock', jar, 500, 200, '2026-09-01', null, 'J1', null)
  await q(`insert into agreements (kind, title, product_id, start_date, end_date) values ('product_permit', 'تصريح', $1, '2026-01-01', '2027-12-31')`, [product])
  customer = (await one<{ id: string }>(`insert into customers (name) values ('عميل') returning id`)).id
  for (const [date, expiry, qty] of [['2026-10-01', '2027-03-01', 30], ['2026-10-05', '2027-04-01', 50]] as const) {
    await rpc('create_production_batch', json({
      product_id: product, production_date: date, expiry_date: expiry, qty_produced: qty,
      consumption: [{ item_id: jar, qty }],
    }))
  }
}, 60_000)

const lotStatus = () =>
  q<{ lot_code: string; qc_status: string; qty_remaining: string }>(
    `select lot_code, qc_status, qty_remaining::text from stock_lots where item_id = $1 order by lot_code`, [product])
const invoice = (lines: unknown[], extra: Record<string, unknown> = {}) =>
  rpc('create_invoice', json({ customer_id: customer, date: '2026-10-10', lines, ...extra }))

describe('production batches', () => {
  it('can be sold as soon as they are made (no quality step)', async () => {
    expect((await lotStatus()).map((l) => l.qc_status)).toEqual(['passed', 'passed'])
    await invoice([{ product_id: product, qty: 5, unit_price_baisa: 1500 }])
    expect((await lotStatus())[0].qty_remaining).toBe('25.000')
  })
})

describe('invoices', () => {
  it('refuses to sell without a valid sale permit', async () => {
    await q(`update agreements set end_date = '2026-10-09' where product_id = $1`, [product])
    await expect(invoice([{ product_id: product, qty: 5, unit_price_baisa: 1500 }])).rejects.toThrow(/تصريح بيع/)
    // The failed attempt does not use up an invoice number
    expect((await one<{ next_no: number }>(`select next_no from doc_counters where kind = 'invoice'`)).next_no).toBe(1)
  })

  it('sells nearest expiry first, across lots, and records each lot with its cost', async () => {
    const id = await invoice([{ product_id: product, qty: 40, unit_price_baisa: 1500 }])
    const inv = await one<{ invoice_no: string; total_baisa: string; due_date: string }>(
      `select invoice_no, total_baisa::text, due_date::text from sales_invoices where id = $1`, [id])
    expect(inv).toEqual({ invoice_no: 'INV-0001', total_baisa: '60000', due_date: '2026-10-25' })
    const lots = await q<{ lot_code: string; qty: string; expiry: string }>(
      `select l.lot_code, ll.qty::text, l.expiry_date::text as expiry from invoice_line_lots ll join stock_lots l on l.id = ll.lot_id order by l.expiry_date`)
    expect(lots).toEqual([
      { lot_code: 'B-0001', qty: '30.000', expiry: '2027-03-01' },
      { lot_code: 'B-0002', qty: '10.000', expiry: '2027-04-01' },
    ])
    expect((await lotStatus()).map((l) => l.qty_remaining)).toEqual(['0.000', '40.000'])
  })

  it('shares the discount across lines and charges VAT per line once registered', async () => {
    await q(`update settings set vat_registered = true, default_vat_rate = 5 where id = 1`)
    const id = await invoice(
      [{ product_id: product, qty: 10, unit_price_baisa: 1000 }, { product_id: product, qty: 5, unit_price_baisa: 2000 }],
      { discount_baisa: 1001 },
    )
    const lines = await q<{ discount_baisa: string; vat_baisa: string }>(
      `select discount_baisa::text, vat_baisa::text from invoice_lines where invoice_id = $1 order by unit_price_baisa`, [id])
    // 10000 and 10000 gross: 501 then the remaining 500; VAT 5% of 9499 = 475, of 9500 = 475
    expect(lines).toEqual([{ discount_baisa: '501', vat_baisa: '475' }, { discount_baisa: '500', vat_baisa: '475' }])
    const inv = await one<{ subtotal_baisa: string; vat_baisa: string; total_baisa: string }>(
      `select subtotal_baisa::text, vat_baisa::text, total_baisa::text from sales_invoices where id = $1`, [id])
    expect(inv).toEqual({ subtotal_baisa: '20000', vat_baisa: '950', total_baisa: '19949' })
  })

  it('charges 0% while not VAT-registered, whatever the line says', async () => {
    const id = await invoice([{ product_id: product, qty: 2, unit_price_baisa: 1500, vat_rate: 5 }])
    expect((await one<{ vat_baisa: string }>(`select vat_baisa::text from sales_invoices where id = $1`, [id])).vat_baisa).toBe('0')
  })

  it('voiding returns stock to the same lots, keeps the number, and frees linked payments', async () => {
    const id = await invoice([{ product_id: product, qty: 12, unit_price_baisa: 1500 }])
    await q(`insert into customer_payments (customer_id, invoice_id, date, amount_baisa) values ($1, $2, '2026-10-11', 5000)`, [customer, id])
    await rpc('void_invoice', id, 'خطأ في الكمية')
    expect((await lotStatus())[0].qty_remaining).toBe('30.000')
    const inv = await one<{ invoice_no: string; status: string }>(`select invoice_no, status from sales_invoices where id = $1`, [id])
    expect(inv).toEqual({ invoice_no: 'INV-0001', status: 'void' })
    expect((await one<{ invoice_id: string | null }>(`select invoice_id from customer_payments`)).invoice_id).toBeNull()
    await expect(rpc('void_invoice', id, null)).rejects.toThrow(/ملغاة مسبقاً/)
    // The next invoice takes the next number: no gaps, no reuse
    expect(await one(`select public.next_doc_no('invoice') as n`)).toEqual({ n: 'INV-0002' })
  })
})

describe('quotations', () => {
  it('can quote a product without a permit; accepting turns it into a numbered invoice', async () => {
    const qid = await rpc('save_quotation', json({
      customer_name: 'عميل جديد', date: '2026-10-08',
      lines: [{ product_id: product, qty: 20, unit_price_baisa: 1500 }],
    }))
    const qt = await one<{ quote_no: string; status: string; valid_until: string; total_baisa: string }>(
      `select quote_no, status, valid_until::text, total_baisa::text from quotations where id = $1`, [qid])
    expect(qt).toEqual({ quote_no: 'Q-0001', status: 'draft', valid_until: '2026-10-22', total_baisa: '30000' })
    expect((await q(`select 1 from customers where name = 'عميل جديد'`)).length).toBe(1)

    // No valid permit on that date: accepting is refused and nothing changes
    await q(`update agreements set start_date = '2026-10-11' where product_id = $1`, [product])
    await expect(rpc('accept_quotation', qid, '2026-10-10')).rejects.toThrow(/تصريح بيع/)
    expect((await one<{ status: string }>(`select status from quotations where id = $1`, [qid])).status).toBe('draft')
    await q(`update agreements set start_date = '2026-01-01' where product_id = $1`, [product])

    const inv = await rpc('accept_quotation', qid, '2026-10-10')
    const after = await one<{ status: string; invoice_id: string }>(`select status, invoice_id from quotations where id = $1`, [qid])
    expect(after).toEqual({ status: 'accepted', invoice_id: inv })
    expect((await one<{ invoice_no: string }>(`select invoice_no from sales_invoices where id = $1`, [inv])).invoice_no).toBe('INV-0001')
    await expect(rpc('save_quotation', json({ id: qid, customer_id: customer, lines: [{ product_id: product, qty: 1, unit_price_baisa: 1 }] })))
      .rejects.toThrow(/لا يمكن تعديل/)
  })
})

describe('demo factory', () => {
  it('loads sales on top of round 1 and can be cleared', async () => {
    db = await freshDb()
    await createUser(db, OWNER, 'owner@example.com')
    await rpc('load_demo_data')
    const invoices = await q<{ invoice_no: string; total_baisa: string }>(`select invoice_no, total_baisa::text from sales_invoices order by invoice_no`)
    expect(invoices).toEqual([{ invoice_no: 'INV-0001', total_baisa: '44000' }, { invoice_no: 'INV-0002', total_baisa: '24500' }])
    expect((await q(`select 1 from quotations`)).length).toBe(2)
    expect((await q<{ qc_status: string }>(`select l.qc_status from stock_lots l join items i on i.id = l.item_id where i.type = 'finished' order by l.lot_code`))
      .map((r) => r.qc_status)).toEqual(['passed', 'passed'])
    await rpc('reset_all_data')
    expect((await q(`select 1 from sales_invoices union all select 1 from customers`)).length).toBe(0)
  })

  it('accepting with a price option uses its prices, due date and note', async () => {
    const qid = await rpc('save_quotation', json({
      customer_id: customer, date: '2026-10-08',
      lines: [{ product_id: product, qty: 10, unit_price_baisa: 1500 }],
      price_options: [{ key: 'advance', pct: -5 }, { key: 'installments', pct: 0 }, { key: 'deferred', pct: 5, n: 60 }, { key: 'bulk', pct: -10, n: 1000 }],
    }))
    await expect(rpc('accept_quotation', qid, '2026-10-10', 'other', null)).rejects.toThrow(/خيار السعر/)
    const inv = await rpc('accept_quotation', qid, '2026-10-10', 'deferred', 'الدفع بعد 60 يوماً')
    expect(await one(`select due_date::text, total_baisa::text, notes from sales_invoices where id = $1`, [inv]))
      .toEqual({ due_date: '2026-12-09', total_baisa: '15750', notes: 'الدفع بعد 60 يوماً' })
    expect(await one(`select unit_price_baisa::text from invoice_lines where invoice_id = $1`, [inv])).toEqual({ unit_price_baisa: '1575' })
    expect(await one(`select chosen_option, jsonb_array_length(price_options) as n from quotations where id = $1`, [qid]))
      .toEqual({ chosen_option: 'deferred', n: 4 })
  })
})
