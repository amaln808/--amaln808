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

async function item(type: string, name: string, unit = 'kg', requiresExpiry = false, extra = '') {
  const r = await one<{ id: string }>(
    `insert into items (type, name, unit, requires_expiry${extra ? ', shelf_life_days' : ''}) values ($1, $2, $3, $4${extra ? `, ${extra}` : ''}) returning id`,
    [type, name, unit, requiresExpiry],
  )
  return r.id
}
const supplier = async () => (await one<{ id: string }>(`insert into suppliers (name) values ('مورد') returning id`)).id
const lots = (itemId: string) =>
  q<{ lot_code: string; qty_remaining: string; unit_cost_baisa: string; expiry_date: string | null }>(
    `select lot_code, qty_remaining, unit_cost_baisa, expiry_date::text from stock_lots where item_id = $1 order by received_date, created_at`,
    [itemId],
  )

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
}, 60_000)

describe('purchases', () => {
  it('creates unknown suppliers and items from typed names, and reuses them next time', async () => {
    const buy = (lines: unknown[]) =>
      rpc('create_purchase_named', JSON.stringify({ supplier_name: ' مزرعة النخيل ', date: '2026-10-01', lines }))
    await buy([
      { item_name: 'تمر خلاص', item_type: 'raw', unit: 'kg', qty: 10, unit_cost_baisa: 900, expiry_date: '2027-01-01' },
      { item_name: 'كرتون', item_type: 'packaging', unit: 'piece', qty: 100, unit_cost_baisa: 50 },
    ])
    await buy([{ item_name: 'تمر خلاص', qty: 5, unit_cost_baisa: 950, expiry_date: '2027-02-01' }])
    const sups = await q<{ name: string; kind: string | null }>(`select name, kind from suppliers`)
    expect(sups).toEqual([{ name: 'مزرعة النخيل', kind: null }])
    const items = await q<{ name: string; type: string; unit: string; requires_expiry: boolean }>(
      `select name, type, unit, requires_expiry from items order by name`,
    )
    expect(items).toEqual([
      { name: 'تمر خلاص', type: 'raw', unit: 'kg', requires_expiry: true },
      { name: 'كرتون', type: 'packaging', unit: 'piece', requires_expiry: false },
    ])
    expect((await q(`select 1 from stock_lots`)).length).toBe(3)
  })

  it('creates nothing when the typed purchase fails', async () => {
    await expect(
      rpc('create_purchase_named', JSON.stringify({
        supplier_name: 'مورد جديد', date: '2026-10-01',
        lines: [{ item_name: 'زيت', item_type: 'raw', qty: 1, unit_cost_baisa: 100 }],
      })),
    ).rejects.toThrow(/تاريخ الانتهاء مطلوب/)
    expect((await q(`select 1 from suppliers union all select 1 from items`)).length).toBe(0)
  })

  it('accepts any text, or none, as the task type', async () => {
    await q(`insert into tasks (title, category, start_date) values ('تنظيف الخزان', 'نظافة الخزانات', current_date), ('مهمة', null, current_date)`)
    expect((await q<{ category: string | null }>(`select category from tasks order by category nulls last`)).map((r) => r.category)).toEqual(['نظافة الخزانات', null])
  })

  it('accepts any text as the supplier type', async () => {
    await q(`insert into suppliers (name, kind) values ('شركة الكهرباء', 'كهرباء')`)
    expect((await one<{ kind: string }>(`select kind from suppliers`)).kind).toBe('كهرباء')
  })

  it('creates a lot per line with expiry, totals and an immediate payment', async () => {
    const s = await supplier()
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const id = await rpc('create_purchase', JSON.stringify({
      supplier_id: s, date: '2026-10-01', paid_baisa: 10000, method: 'cash',
      lines: [{ item_id: dates, qty: 50, unit_cost_baisa: 1200, supplier_lot_code: 'A1', expiry_date: '2027-01-01' }],
    }))
    expect(await one(`select subtotal_baisa, vat_baisa, total_baisa from purchases where id = $1`, [id])).toEqual({
      subtotal_baisa: 60000, vat_baisa: 0, total_baisa: 60000,
    })
    expect(await lots(dates)).toEqual([{ lot_code: 'A1', qty_remaining: '50.000', unit_cost_baisa: '1200.000', expiry_date: '2027-01-01' }])
    expect(await one(`select amount_baisa from supplier_payments where purchase_id = $1`, [id])).toEqual({ amount_baisa: 10000 })
  })

  it('refuses a raw material without an expiry date', async () => {
    const s = await supplier()
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    await expect(rpc('create_purchase', JSON.stringify({ supplier_id: s, date: '2026-10-01', lines: [{ item_id: dates, qty: 1, unit_cost_baisa: 1 }] })))
      .rejects.toThrow(/تاريخ الانتهاء مطلوب/)
    expect(await q('select * from purchases')).toEqual([])
  })

  it('adds unreclaimable VAT to the lot cost while not VAT-registered', async () => {
    const s = await supplier()
    const jar = await item('packaging', 'علبة', 'piece')
    await rpc('create_purchase', JSON.stringify({ supplier_id: s, date: '2026-10-01', lines: [{ item_id: jar, qty: 10, unit_cost_baisa: 200, vat_rate: 5 }] }))
    expect((await lots(jar))[0].unit_cost_baisa).toBe('210.000')
    expect(await one('select subtotal_baisa, vat_baisa, total_baisa from purchases')).toEqual({ subtotal_baisa: 2000, vat_baisa: 100, total_baisa: 2100 })
  })

  it('can be deleted only while untouched', async () => {
    const s = await supplier()
    const jar = await item('packaging', 'علبة', 'piece')
    const id = await rpc('create_purchase', JSON.stringify({ supplier_id: s, date: '2026-10-01', paid_baisa: 500, lines: [{ item_id: jar, qty: 10, unit_cost_baisa: 100 }] }))
    await q(`select public.stock_out($1, 2, '2026-10-02', 'waste', 'manual', null)`, [jar])
    await expect(rpc('delete_purchase', id)).rejects.toThrow(/لا يمكن الحذف/)
    const id2 = await rpc('create_purchase', JSON.stringify({ supplier_id: s, date: '2026-10-01', paid_baisa: 300, lines: [{ item_id: jar, qty: 5, unit_cost_baisa: 100 }] }))
    await rpc('delete_purchase', id2)
    expect(await q('select id from purchases where id = $1', [id2])).toEqual([])
    expect(await q('select id from supplier_payments where purchase_id = $1', [id2])).toEqual([])
    expect((await lots(jar)).length).toBe(1)
  })
})

describe('FEFO', () => {
  it('takes the nearest expiry first, skips expired lots, and splits across lots', async () => {
    const s = await supplier()
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const buy = (code: string, qty: number, cost: number, expiry: string, date: string) =>
      rpc('create_purchase', JSON.stringify({ supplier_id: s, date, lines: [{ item_id: dates, qty, unit_cost_baisa: cost, supplier_lot_code: code, expiry_date: expiry }] }))
    await buy('LATE', 10, 1000, '2027-06-01', '2026-09-01') // received first, expires last
    await buy('SOON', 5, 1500, '2026-11-01', '2026-09-10')
    await buy('GONE', 7, 900, '2026-09-30', '2026-08-01') // already expired on 2026-10-05

    const alloc = (await rpc('stock_out', dates, 8, '2026-10-05', 'waste', 'manual', null)) as Array<{ qty: number; unit_cost: number }>
    expect(alloc.map((a) => [Number(a.qty), Number(a.unit_cost)])).toEqual([[5, 1500], [3, 1000]])
    expect((await lots(dates)).map((l) => [l.lot_code, l.qty_remaining])).toEqual([
      ['GONE', '7.000'], ['LATE', '7.000'], ['SOON', '0.000'],
    ])
    await expect(rpc('stock_out', dates, 8, '2026-10-05', 'waste', 'manual', null)).rejects.toThrow(/الكمية غير كافية من «معجون تمر»: المطلوب 8.000 والمتاح 7.000/)
  })

  it('stock view shows usable, expired and value', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    await rpc('add_opening_stock', dates, 4, 1000, '2026-01-01', '2026-02-01', 'OLD', null)
    await rpc('add_opening_stock', dates, 6, 1500, '2026-10-01', '2099-01-01', 'NEW', null)
    expect(await one(`select qty, usable_qty, expired_qty, value_baisa, nearest_expiry::text from v_stock where item_id = $1`, [dates])).toEqual({
      qty: '10.000', usable_qty: '6.000', expired_qty: '4.000', value_baisa: 13000, nearest_expiry: '2099-01-01',
    })
  })

  it('adjusts and records waste on a lot', async () => {
    const jar = await item('packaging', 'علبة', 'piece')
    const lot = await rpc('add_opening_stock', jar, 10, 100, '2026-10-01', null, null, null)
    await rpc('adjust_lot', lot, -3, 'waste', '2026-10-02', 'مكسورة')
    await rpc('adjust_lot', lot, 2, 'adjustment', '2026-10-03', 'جرد')
    expect(await one('select qty_in, qty_remaining from stock_lots where id = $1', [lot])).toEqual({ qty_in: '12.000', qty_remaining: '9.000' })
    await expect(rpc('adjust_lot', lot, -20, 'waste', '2026-10-03', null)).rejects.toThrow(/لا يمكن إنقاص/)
    await expect(rpc('adjust_lot', lot, 1, 'waste', '2026-10-03', null)).rejects.toThrow(/التالف/)
  })
})

describe('deleting items', () => {
  it('deletes an unused item for good, and only hides one with history', async () => {
    const unused = await item('packaging', 'علبة قديمة', 'piece')
    const product = await item('finished', 'منتج متوقف', 'piece')
    await rpc('save_recipe', product, JSON.stringify([{ item_id: unused, qty_per_unit: 1 }]), false)
    expect(await rpc('delete_item', unused)).toBe('deleted')
    expect((await q('select 1 from recipe_components')).length).toBe(0)

    const used = await item('raw', 'تمر', 'kg', true)
    await rpc('add_opening_stock', used, 5, 1000, '2026-10-01', '2027-01-01', null, null)
    expect(await rpc('delete_item', used)).toBe('hidden')
    expect((await one<{ active: boolean }>('select active from items where id = $1', [used])).active).toBe(false)
    expect((await q('select 1 from stock_lots where item_id = $1', [used])).length).toBe(1)

    expect(await rpc('delete_item', product)).toBe('deleted')
    expect((await q('select 1 from recipes')).length).toBe(0)
  })
})

describe('production', () => {
  it('a batch can use a typed new material and stock a shortage in the same save', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const product = await item('finished', 'مكعبات', 'piece')
    await rpc('add_opening_stock', dates, 2, 1000, '2026-10-01', '2027-01-01', null, null)
    const id = await rpc('create_production_batch_named', JSON.stringify({
      product_id: product, production_date: '2026-10-10', qty_produced: 10,
      consumption: [
        // 2 kg in stock, 5 needed: the missing 3 kg are added at 1.200
        { item_id: dates, qty: 5, add_stock: { qty: 3, unit_cost_baisa: 1200, expiry_date: '2027-02-01' } },
        { item_name: 'كاكاو', item_type: 'raw', unit: 'kg', qty: 1, add_stock: { qty: 1, unit_cost_baisa: 4000, expiry_date: '2027-03-01' } },
      ],
    }))
    const b = await one<{ materials_cost_baisa: string }>(`select materials_cost_baisa::text from production_batches where id = $1`, [id])
    expect(b.materials_cost_baisa).toBe('9600') // 2×1000 + 3×1200 + 1×4000
    expect((await q(`select 1 from items where name = 'كاكاو'`)).length).toBe(1)
    // Without the extra stock the same batch is refused and nothing is left behind
    await expect(rpc('create_production_batch_named', JSON.stringify({
      product_id: product, production_date: '2026-10-11', qty_produced: 1, consumption: [{ item_name: 'فانيلا', item_type: 'raw', qty: 1 }],
    }))).rejects.toThrow(/غير كافية/)
    expect((await q(`select 1 from items where name = 'فانيلا'`)).length).toBe(0)
  })

  it('saves a recipe from typed material names, creating only the new ones', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const product = await item('finished', 'مكعبات تمر', 'piece')
    await rpc('save_recipe_named', product, JSON.stringify([
      { item_id: dates, qty_per_unit: 0.2 },
      { item_name: 'شوكولاتة داكنة', item_type: 'raw', unit: 'kg', qty_per_unit: 0.05 },
      { item_name: 'علبة كرتون', item_type: 'packaging', qty_per_unit: 1 },
    ]), false)
    // Saving again with the same typed names reuses the materials
    await rpc('save_recipe_named', product, JSON.stringify([
      { item_name: ' شوكولاتة داكنة ', item_type: 'raw', qty_per_unit: 0.06 },
      { item_name: 'علبة كرتون', item_type: 'packaging', qty_per_unit: 1 },
    ]), false)
    const rows = await q<{ name: string; type: string; unit: string; qty_per_unit: string }>(
      `select i.name, i.type, i.unit, c.qty_per_unit::text from recipe_components c join items i on i.id = c.item_id order by i.name`,
    )
    expect(rows).toEqual([
      { name: 'شوكولاتة داكنة', type: 'raw', unit: 'kg', qty_per_unit: '0.060' },
      { name: 'علبة كرتون', type: 'packaging', unit: 'piece', qty_per_unit: '1.000' },
    ])
    expect((await q(`select 1 from items where type <> 'finished'`)).length).toBe(3)
    await expect(
      rpc('save_recipe_named', product, JSON.stringify([
        { item_id: dates, qty_per_unit: 0.2 },
        { item_name: 'معجون تمر', qty_per_unit: 0.1 },
      ]), false),
    ).rejects.toThrow(/مرة واحدة/)
  })

  it('consumes FEFO, records lots used, and costs the unit from real lot costs', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const jar = await item('packaging', 'علبة', 'piece')
    const product = await item('finished', 'معجون 250', 'piece', false, '180')
    await rpc('add_opening_stock', dates, 2, 1000, '2026-09-01', '2026-12-01', 'A', null)
    await rpc('add_opening_stock', dates, 10, 1300, '2026-10-01', '2027-03-01', 'B', null)
    await rpc('add_opening_stock', jar, 100, 200, '2026-10-01', null, null, null)

    const id = await rpc('create_production_batch', JSON.stringify({
      product_id: product, production_date: '2026-10-10', qty_produced: 10, extra_cost_baisa: 500,
      consumption: [{ item_id: dates, qty: 2.5 }, { item_id: jar, qty: 10 }],
    }))
    // dates: 2 × 1000 + 0.5 × 1300 = 2650; jars 10 × 200 = 2000 → 4650 + 500 = 5150 / 10
    expect(await one(`select batch_no, materials_cost_baisa, total_cost_baisa, unit_cost_baisa, expiry_date::text from production_batches where id = $1`, [id])).toEqual({
      batch_no: 'B-0001', materials_cost_baisa: 4650, total_cost_baisa: 5150, unit_cost_baisa: '515.000', expiry_date: '2027-04-08',
    })
    const out = await one<{ qty_remaining: string; unit_cost_baisa: string; qc_status: string; lot_code: string }>(
      `select qty_remaining, unit_cost_baisa, qc_status, lot_code from stock_lots where item_id = $1`, [product])
    expect(out).toEqual({ qty_remaining: '10.000', unit_cost_baisa: '515.000', qc_status: 'passed', lot_code: 'B-0001' })
    expect((await q('select * from batch_consumption where batch_id = $1', [id])).length).toBe(3)

    // No quality step: the batch can be sold straight away
    await rpc('stock_out', product, 1, '2026-10-11', 'sale', 'manual', null, null, true)
  })

  it('refuses when materials are short and leaves nothing behind', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const product = await item('finished', 'معجون', 'piece')
    await rpc('add_opening_stock', dates, 1, 1000, '2026-10-01', '2027-01-01', null, null)
    await expect(rpc('create_production_batch', JSON.stringify({ product_id: product, production_date: '2026-10-10', qty_produced: 5, consumption: [{ item_id: dates, qty: 3 }] })))
      .rejects.toThrow(/غير كافية/)
    expect(await q('select * from production_batches')).toEqual([])
    expect((await lots(dates))[0].qty_remaining).toBe('1.000')
    // the failed attempt did not use up a batch number
    expect(await one(`select next_no from doc_counters where kind = 'batch'`)).toEqual({ next_no: 1 })
  })

  it('deleting a batch returns materials to their lots', async () => {
    const dates = await item('raw', 'معجون تمر', 'kg', true)
    const product = await item('finished', 'معجون', 'piece')
    await rpc('add_opening_stock', dates, 5, 1000, '2026-10-01', '2027-01-01', null, null)
    const id = await rpc('create_production_batch', JSON.stringify({ product_id: product, production_date: '2026-10-10', qty_produced: 4, consumption: [{ item_id: dates, qty: 2 }] }))
    await rpc('delete_production_batch', id)
    expect((await lots(dates))[0].qty_remaining).toBe('5.000')
    expect(await lots(product)).toEqual([])
  })
})

describe('demo data', () => {
  it('loads a consistent pretend factory and can be cleared', async () => {
    await rpc('load_demo_data')
    expect(Number((await one<{ n: string }>('select count(*) as n from items')).n)).toBe(8)
    expect(Number((await one<{ n: string }>('select count(*) as n from production_batches')).n)).toBe(2)
    expect(Number((await one<{ n: string }>(`select count(*) as n from stock_lots where expiry_date < current_date and qty_remaining > 0`)).n)).toBe(1)
    await expect(rpc('load_demo_data')).rejects.toThrow(/توجد أصناف/)

    await rpc('reset_all_data')
    expect(await q('select * from items')).toEqual([])
    expect(Number((await one<{ n: string }>('select count(*) as n from channels')).n)).toBe(4)
    expect(Number((await one<{ n: string }>('select count(*) as n from expense_categories')).n)).toBe(10)
    expect(await one(`select next_no from doc_counters where kind = 'batch'`)).toEqual({ next_no: 1 })
    expect((await q('select * from members')).length).toBe(1)
  })

  it('only the owner can clear everything', async () => {
    await db.query(`update members set role = 'staff'`)
    await expect(rpc('reset_all_data')).rejects.toThrow(/لصاحبة المشروع/)
  })
})
