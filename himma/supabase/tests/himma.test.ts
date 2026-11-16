import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUser, queryAs } from '../../../supabase/tests/harness'

const dir = join(import.meta.dirname, '..')
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const asA = { role: 'authenticated', userId: A } as const
const asB = { role: 'authenticated', userId: B } as const

let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(readFileSync(join(dir, '../../supabase/tests/supabase_stubs.sql'), 'utf8'))
  for (const f of readdirSync(join(dir, 'migrations')).sort()) await db.exec(readFileSync(join(dir, 'migrations', f), 'utf8'))
  await createUser(db, A, 'a@example.com')
  await createUser(db, B, 'b@example.com')
})

describe('الهمة database', () => {
  it('keeps each user to their own rows', async () => {
    const [task] = await queryAs<{ id: string }>(db, asA, `insert into tasks (title, recurrence) values ('قراءة', 'daily') returning id`)
    await queryAs(db, asA, `insert into task_done (task_id, due_date, note) values ($1, '2026-11-16', 'عشر صفحات')`, [task.id])
    const [goal] = await queryAs<{ id: string }>(db, asA, `insert into goals (title, target, end_date) values ('بيع', 500, '2026-12-31') returning id`)
    await queryAs(db, asA, `insert into goal_entries (goal_id, amount) values ($1, 40)`, [goal.id])

    for (const t of ['tasks', 'task_done', 'goals', 'goal_entries']) {
      expect(await queryAs(db, asA, `select * from ${t}`)).toHaveLength(1)
      expect(await queryAs(db, asB, `select * from ${t}`)).toHaveLength(0)
    }
    // B cannot touch A's rows
    await queryAs(db, asB, `update tasks set title = 'x' where true`)
    await queryAs(db, asB, `delete from goals where true`)
    expect((await queryAs<{ title: string }>(db, asA, 'select title from tasks'))[0].title).toBe('قراءة')
    expect(await queryAs(db, asA, 'select * from goals')).toHaveLength(1)
    // …nor attach entries to them, nor write rows under A's name
    await expect(queryAs(db, asB, `insert into task_done (task_id, due_date) values ($1, '2026-11-17')`, [task.id])).rejects.toThrow(/Task not found/)
    await expect(queryAs(db, asB, `insert into goal_entries (goal_id, amount) values ($1, 1)`, [goal.id])).rejects.toThrow(/Goal not found/)
    await expect(queryAs(db, asB, `insert into tasks (user_id, title) values ($1, 'x')`, [A])).rejects.toThrow(/row-level security/)
  })

  it('gives anonymous visitors nothing but ping()', async () => {
    for (const t of ['tasks', 'task_done', 'goals', 'goal_entries']) {
      await expect(queryAs(db, { role: 'anon' }, `select * from ${t}`)).rejects.toThrow(/permission denied/)
    }
    expect(await queryAs(db, { role: 'anon' }, 'select ping() as p')).toEqual([{ p: 1 }])
  })

  it('marks an occurrence done only once and removes it with its task', async () => {
    const [t] = await queryAs<{ id: string }>(db, asA, `insert into tasks (title) values ('مرة') returning id`)
    await queryAs(db, asA, `insert into task_done (task_id, due_date) values ($1, '2026-11-16')`, [t.id])
    await expect(queryAs(db, asA, `insert into task_done (task_id, due_date) values ($1, '2026-11-16')`, [t.id])).rejects.toThrow(/duplicate/)
    await queryAs(db, asA, 'delete from tasks where id = $1', [t.id])
    expect(await queryAs(db, asA, 'select * from task_done where task_id = $1', [t.id])).toHaveLength(0)
  })
})
