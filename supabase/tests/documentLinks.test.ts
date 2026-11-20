import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { applyMigration, createUser, freshDb, queryAs, type Who } from './harness'

const OWNER = '11111111-1111-4111-8111-111111111111'
const owner: Who = { role: 'authenticated', userId: OWNER }
const TABLES = ['sales_invoices', 'purchases', 'customer_payments', 'supplier_payments', 'expenses', 'customers', 'suppliers', 'agreements']
const LINK = 'https://drive.google.com/file/d/1AbC-xyz/view?usp=sharing'
let db: PGlite

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => queryAs<T>(db, owner, sql, params)
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0]

describe('document links (0025)', () => {
  beforeEach(async () => {
    db = await freshDb()
    await createUser(db, OWNER, 'owner@example.com')
  }, 60_000)

  it('adds an optional document_url to every table that keeps documents', async () => {
    const cols = await q<{ table_name: string }>(
      `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'document_url' order by table_name`,
    )
    expect(cols.map((c) => c.table_name)).toEqual([...TABLES].sort())
  })

  it('keeps https links and refuses anything else', async () => {
    const c = await one<{ id: string; document_url: string }>(`insert into customers (name, document_url) values ('جمعية الخير', $1) returning id, document_url`, [LINK])
    expect(c.document_url).toBe(LINK)
    for (const bad of ['http://drive.google.com/x', 'drive.google.com/x', 'javascript:alert(1)', 'https://a b']) {
      await expect(q(`update customers set document_url = $1 where id = $2`, [bad, c.id])).rejects.toThrow(/document_url_check/)
    }
    await q(`update customers set document_url = null where id = $1`, [c.id])
  })

  it('save_expense keeps the link, and clears it when left empty', async () => {
    const save = (p: Record<string, unknown>) => one<{ r: string }>('select public.save_expense($1) as r', [JSON.stringify(p)]).then((x) => x.r)
    const id = await save({ date: '2026-11-20', category_name: 'نقل', amount_baisa: 5000, document_url: LINK })
    expect((await one<{ document_url: string }>('select document_url from expenses where id = $1', [id])).document_url).toBe(LINK)
    await save({ id, date: '2026-11-20', category_name: 'نقل', amount_baisa: 5000, document_url: '' })
    expect((await one('select document_url from expenses where id = $1', [id])).document_url).toBeNull()
  })
})

describe('applying 0025 to a database that already has data', () => {
  it('changes nothing in existing rows; they get an empty link', async () => {
    db = await freshDb('0025')
    await createUser(db, OWNER, 'owner@example.com')
    await q(`insert into customers (name, phone) values ('عميل قديم', '99887766')`)
    await q(`insert into suppliers (name) values ('مورد قديم')`)
    await one(`select public.save_expense($1)`, [JSON.stringify({ date: '2026-11-01', category_name: 'كهرباء', amount_baisa: 23450, notes: 'قديم' })])
    const before = await q(`select name, phone from customers union all select name, null from suppliers order by 1`)
    await applyMigration(db, '0025_document_links.sql')
    expect(await q(`select name, phone from customers union all select name, null from suppliers order by 1`)).toEqual(before)
    expect(await one(`select amount_baisa::int, notes, document_url from expenses`)).toEqual({ amount_baisa: 23450, notes: 'قديم', document_url: null })
    expect(await one(`select count(*)::int as n from customers where document_url is null`)).toEqual({ n: 1 })
  }, 60_000)
})
