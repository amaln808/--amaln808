import type { PGlite } from '@electric-sql/pglite'
import { beforeEach, describe, expect, it } from 'vitest'
import { createUser, freshDb, queryAs, type Who } from './harness'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STAFF = '22222222-2222-4222-8222-222222222222'
const owner: Who = { role: 'authenticated', userId: OWNER }
let db: PGlite

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => queryAs<T>(db, owner, sql, params)
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0]

/** Row count and a fingerprint of every backed-up table */
async function snapshot() {
  const tables = (await one<{ t: string[] }>('select public.backup_tables() as t')).t
  const out: Record<string, string> = {}
  for (const t of tables) {
    const r = await one<{ n: number; h: string }>(
      `select count(*)::int as n, coalesce(md5(string_agg((to_jsonb(x) - 'updated_at')::text, '|' order by x::text)), '') as h from public.${t} x`)
    out[t] = `${r.n}:${r.h}`
  }
  return out
}

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, OWNER, 'owner@example.com')
}, 60_000)

describe('backup', () => {
  it('lists every business table (nothing left out of a backup)', async () => {
    const all = await q<{ t: string }>(`select table_name as t from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('members', 'audit_log', 'schema_migrations') order by 1`)
    const listed = (await one<{ t: string[] }>('select public.backup_tables() as t')).t
    expect([...listed].sort()).toEqual(all.map((r) => r.t))
  })

  it('restores the demo factory exactly, in one go', async () => {
    await q('select public.load_demo_data()')
    const before = await snapshot()
    const backup = (await one<{ b: Record<string, unknown> }>('select public.export_backup() as b')).b
    expect(backup).toMatchObject({ app: 'zawrda', format: 2 })

    await q('select public.reset_all_data()')
    expect((await one<{ n: number }>('select count(*)::int as n from items')).n).toBe(0)

    const counts = (await one<{ c: Record<string, number> }>('select public.restore_backup($1) as c', [JSON.stringify(backup)])).c
    expect(counts.items).toBeGreaterThan(0)
    expect(await snapshot()).toEqual(before)
    // Numbering continues where it was
    expect((await one<{ n: string }>(`select public.next_doc_no('invoice') as n`)).n).not.toBe('INV-0001')
  })

  it('a backup without a newer column still restores (the column takes its default)', async () => {
    await q('select public.load_demo_data()')
    const backup = (await one<{ b: { tables: Record<string, Array<Record<string, unknown>>> } }>('select public.export_backup() as b')).b
    for (const r of backup.tables.quotations) delete r.price_options
    await q('select public.restore_backup($1)', [JSON.stringify(backup)])
    expect((await one<{ n: number }>('select count(*)::int as n from quotations')).n).toBe(backup.tables.quotations.length)
  })

  it('refuses a foreign file, a broken one (nothing changes), and anyone but the owner', async () => {
    await q('select public.load_demo_data()')
    const before = await snapshot()
    await expect(q('select public.restore_backup($1)', [JSON.stringify({ app: 'other', tables: {} })])).rejects.toThrow(/ليس نسخة/)
    const backup = (await one<{ b: { tables: Record<string, Array<Record<string, unknown>>> } }>('select public.export_backup() as b')).b
    backup.tables.invoice_lines[0].invoice_id = '99999999-9999-4999-8999-999999999999' // points nowhere
    await expect(q('select public.restore_backup($1)', [JSON.stringify(backup)])).rejects.toThrow()
    expect(await snapshot()).toEqual(before)

    await createUser(db, STAFF, 'staff@example.com')
    await queryAs(db, { role: 'admin' }, `insert into members (user_id, display_name, role) values ($1, 'staff', 'staff') on conflict (user_id) do update set role = 'staff', active = true`, [STAFF])
    await expect(queryAs(db, { role: 'authenticated', userId: STAFF }, 'select public.restore_backup($1)', [JSON.stringify(backup)])).rejects.toThrow(/لصاحبة المشروع/)
    await expect(queryAs(db, { role: 'anon' }, 'select public.export_backup()')).rejects.toThrow()
  })
})
