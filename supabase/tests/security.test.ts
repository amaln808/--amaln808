import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, freshDb, queryAs, type Who } from './harness'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const owner: Who = { role: 'authenticated', userId: OWNER }
const stranger: Who = { role: 'authenticated', userId: STRANGER }
const anon: Who = { role: 'anon' }

let db: PGlite

const tables = async () =>
  (
    await queryAs<{ tablename: string }>(
      db,
      { role: 'admin' },
      `select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' order by 1`,
    )
  ).map((r) => r.tablename)

beforeAll(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
  await createUser(db, STRANGER, 'stranger@example.com')
}, 60_000)

describe('membership', () => {
  it('makes only the first account a member', async () => {
    const rows = await queryAs<{ user_id: string; role: string }>(db, { role: 'admin' }, 'select user_id, role from members')
    expect(rows).toEqual([{ user_id: OWNER, role: 'owner' }])
  })

  it('a member cannot add members from the app', async () => {
    await expect(queryAs(db, owner, `insert into members (user_id) values ($1)`, [STRANGER])).rejects.toThrow(/permission denied/)
  })
})

describe('row level security', () => {
  it('has RLS enabled on every public table', async () => {
    const rows = await queryAs<{ relname: string }>(
      db,
      { role: 'admin' },
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows).toEqual([])
  })

  it('the owner sees the starting data', async () => {
    expect(await queryAs(db, owner, 'select company_name, default_vat_rate, vat_registered from settings')).toEqual([
      { company_name: 'زوردة', default_vat_rate: '0.00', vat_registered: false },
    ])
    expect((await queryAs(db, owner, 'select * from channels')).length).toBe(4)
    expect((await queryAs(db, owner, 'select * from expense_categories')).length).toBe(10)
  })

  it('a signed-in stranger sees zero rows in every table', async () => {
    for (const t of await tables()) {
      expect(await queryAs(db, stranger, `select * from ${t}`), t).toEqual([])
    }
  })

  it('a stranger cannot write', async () => {
    await expect(queryAs(db, stranger, `insert into channels (name) values ('x')`)).rejects.toThrow(/row-level security/)
    await queryAs(db, stranger, `update settings set company_name = 'x'`)
    await queryAs(db, stranger, `delete from expense_categories`)
    expect(await queryAs(db, owner, 'select company_name from settings')).toEqual([{ company_name: 'زوردة' }])
    expect((await queryAs(db, owner, 'select * from expense_categories')).length).toBe(10)
  })

  it('an anonymous visitor is refused on every table', async () => {
    for (const t of await tables()) {
      await expect(queryAs(db, anon, `select * from ${t}`), t).rejects.toThrow(/permission denied/)
    }
  })

  it('settings stays a single row', async () => {
    await expect(queryAs(db, owner, `insert into settings (id) values (1)`)).rejects.toThrow()
    await queryAs(db, owner, `delete from settings`)
    expect((await queryAs(db, owner, 'select id from settings')).length).toBe(1)
  })
})

describe('functions', () => {
  it('ping is open to anyone and returns 1', async () => {
    expect(await queryAs(db, anon, 'select public.ping() as v')).toEqual([{ v: 1 }])
  })

  it('anonymous visitors cannot call other functions', async () => {
    await expect(queryAs(db, anon, `select public.next_doc_no('invoice')`)).rejects.toThrow(/permission denied/)
    await expect(queryAs(db, anon, `select * from public.storage_usage()`)).rejects.toThrow(/permission denied/)
  })

  it('numbers documents in sequence and a rolled-back attempt does not use a number', async () => {
    expect(await queryAs(db, owner, `select public.next_doc_no('quote') as n`)).toEqual([{ n: 'Q-0001' }])
    await queryAs(db, { role: 'admin' }, 'begin')
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [OWNER])
    await db.exec('set role authenticated')
    await db.query(`select public.next_doc_no('quote')`)
    await db.exec('rollback')
    expect(await queryAs(db, owner, `select public.next_doc_no('quote') as n`)).toEqual([{ n: 'Q-0002' }])
  })

  it('refuses document numbers for non-members', async () => {
    await expect(queryAs(db, stranger, `select public.next_doc_no('invoice')`)).rejects.toThrow(/not allowed/)
  })
})

describe('audit log', () => {
  it('records who changed what, before and after', async () => {
    await queryAs(db, owner, `update settings set phone = '99999999'`)
    const rows = await queryAs<{ user_id: string; action: string; old_data: { phone: string }; new_data: { phone: string } }>(
      db,
      owner,
      `select user_id, action, old_data, new_data from audit_log where table_name = 'settings' order by id desc limit 1`,
    )
    expect(rows[0].user_id).toBe(OWNER)
    expect(rows[0].action).toBe('update')
    expect(rows[0].old_data.phone).toBe('77681600')
    expect(rows[0].new_data.phone).toBe('99999999')
  })

  it('cannot be edited or deleted, even by the owner', async () => {
    await expect(queryAs(db, owner, `delete from audit_log`)).rejects.toThrow(/permission denied/)
    await expect(queryAs(db, owner, `update audit_log set action = 'insert'`)).rejects.toThrow(/permission denied/)
    await expect(queryAs(db, owner, `insert into audit_log (table_name, action) values ('x', 'insert')`)).rejects.toThrow(
      /permission denied/,
    )
  })

  it('is hidden from strangers', async () => {
    expect(await queryAs(db, stranger, 'select * from audit_log')).toEqual([])
  })
})

describe('storage', () => {
  it('creates five private buckets', async () => {
    const rows = await queryAs(db, { role: 'admin' }, 'select id, public from storage.buckets order by id')
    expect(rows).toEqual([
      { id: 'branding', public: false },
      { id: 'documents', public: false },
      { id: 'lab-certificates', public: false },
      { id: 'products', public: false },
      { id: 'receipts', public: false },
    ])
  })

  it('members can upload and read; strangers can do neither', async () => {
    await queryAs(db, owner, `insert into storage.objects (bucket_id, name, metadata) values ('branding', 'stamp.png', '{"size": 1000}')`)
    expect((await queryAs(db, owner, `select name from storage.objects`)).length).toBe(1)
    expect(await queryAs(db, stranger, `select name from storage.objects`)).toEqual([])
    expect(await queryAs(db, anon, `select name from storage.objects`)).toEqual([])
    await expect(
      queryAs(db, stranger, `insert into storage.objects (bucket_id, name) values ('branding', 'fake.png')`),
    ).rejects.toThrow(/row-level security/)
  })

  it('reports used space to members', async () => {
    const [u] = await queryAs<{ files_bytes: string; files_count: string }>(db, owner, 'select * from public.storage_usage()')
    expect(Number(u.files_bytes)).toBe(1000)
    expect(Number(u.files_count)).toBe(1)
  })
})

describe('tasks and agreements', () => {
  it('a product is sellable only while its permit is valid', async () => {
    const [p] = await queryAs<{ id: string }>(
      db,
      owner,
      `insert into items (type, name, unit) values ('finished', 'معجون 250 جم', 'piece') returning id`,
    )
    const valid = (date: string) =>
      queryAs<{ ok: boolean }>(db, owner, 'select public.product_permit_valid($1, $2) as ok', [p.id, date]).then((r) => r[0].ok)

    expect(await valid('2026-11-01')).toBe(false) // no permit yet
    await queryAs(
      db,
      owner,
      `insert into agreements (kind, title, product_id, start_date, end_date) values ('product_permit', 'تصريح', $1, '2026-01-01', '2026-12-31')`,
      [p.id],
    )
    expect(await valid('2026-11-01')).toBe(true)
    expect(await valid('2027-01-01')).toBe(false) // expired
    expect(await valid('2025-12-31')).toBe(false) // not started
  })

  it('a product permit must name its product', async () => {
    await expect(
      queryAs(db, owner, `insert into agreements (kind, title, end_date) values ('product_permit', 'x', '2027-01-01')`),
    ).rejects.toThrow(/check/)
  })

  it('records each occurrence of a task once', async () => {
    const [task] = await queryAs<{ id: string }>(
      db,
      owner,
      `insert into tasks (title, recurrence, start_date) values ('تنظيف الخط', 'daily', '2026-10-01') returning id`,
    )
    await queryAs(db, owner, `insert into task_completions (task_id, due_date) values ($1, '2026-10-24')`, [task.id])
    await expect(
      queryAs(db, owner, `insert into task_completions (task_id, due_date) values ($1, '2026-10-24')`, [task.id]),
    ).rejects.toThrow(/duplicate/)
    expect(await queryAs(db, stranger, 'select * from tasks')).toEqual([])
  })
})
