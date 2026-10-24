import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(dir, p), 'utf8')

export const MIGRATIONS = readdirSync(join(dir, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()

/** A fresh in-memory database with the Supabase stand-ins and every migration applied. */
export async function freshDb() {
  const db = new PGlite()
  await db.exec(read('tests/supabase_stubs.sql'))
  for (const f of MIGRATIONS) await db.exec(read(`migrations/${f}`))
  return db
}

export type Who = { role: 'anon' } | { role: 'authenticated'; userId: string } | { role: 'admin' }

/** Runs a query as a given caller, like a request through the Supabase API would. */
export async function queryAs<T = Record<string, unknown>>(db: PGlite, who: Who, sql: string, params: unknown[] = []) {
  await db.exec('reset role')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who.role === 'authenticated' ? who.userId : ''])
  if (who.role !== 'admin') await db.exec(`set role ${who.role}`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

export async function createUser(db: PGlite, id: string, email: string) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
}
