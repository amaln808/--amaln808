import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { addDays } from 'date-fns'
import type { Recurrence } from '../../../src/domain/schedule'
import { day, iso } from '../../../src/domain/schedule'
import type { Scope } from '../domain/performance'
import { db } from './client'

export interface Task {
  id: string
  title: string
  notes: string | null
  scope: Scope
  category: string | null
  important: boolean
  recurrence: Recurrence
  intervalN: number
  startDate: string
  endDate: string | null
  weekdays: number[]
  dueTime: string | null
  archivedOn: string | null
}

export interface Done {
  id: string
  taskId: string
  dueDate: string
  doneAt: string
  note: string | null
}

export interface Goal {
  id: string
  title: string
  scope: Scope
  unit: string | null
  target: number
  startDate: string
  endDate: string
  notes: string | null
  archived: boolean
}

export interface Entry {
  id: string
  goalId: string
  date: string
  amount: number
  note: string | null
}

export interface Data {
  tasks: Task[]
  done: Done[]
  goals: Goal[]
  entries: Entry[]
}

const EMPTY: Data = { tasks: [], done: [], goals: [], entries: [] }
const CACHE = 'himma-cache'

// ── snake_case rows ⇄ camelCase objects ──
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v
  if (typeof out.target === 'string') out.target = Number(out.target)
  if (typeof out.amount === 'string') out.amount = Number(out.amount)
  if (typeof out.dueTime === 'string') out.dueTime = (out.dueTime as string).slice(0, 5)
  return out as T
}
function toRow(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[snake(k)] = v
  return out
}

async function fetchAll<T>(table: string, filter?: (q: any) => any): Promise<T[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    let q = db().from(table).select('*').order('id').range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows.map((r) => fromRow<T>(r))
}

async function loadAll(): Promise<Data> {
  // Completions from the last ~15 months are enough for every page
  const since = iso(addDays(new Date(), -460))
  const [tasks, done, goals, entries] = await Promise.all([
    fetchAll<Task>('tasks'),
    fetchAll<Done>('task_done', (q) => q.gte('due_date', since)),
    fetchAll<Goal>('goals'),
    fetchAll<Entry>('goal_entries'),
  ])
  return { tasks, done, goals, entries }
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

interface Store extends Data {
  loading: boolean
  /** true when showing the copy saved on this device because the server could not be reached */
  offline: boolean
  reload: () => Promise<void>
  saveTask: (t: Partial<Task>) => Promise<void>
  removeTask: (t: Task) => Promise<'deleted' | 'stopped'>
  restoreTask: (t: Task) => Promise<void>
  setDone: (task: Task, date: string, done: boolean) => Promise<void>
  setDoneNote: (d: Done, note: string) => Promise<void>
  saveGoal: (g: Partial<Goal>) => Promise<void>
  removeGoal: (g: Goal) => Promise<void>
  addEntry: (e: Omit<Entry, 'id'>) => Promise<void>
  removeEntry: (e: Entry) => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside DataProvider')
  return s
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(() => {
    try {
      return { ...EMPTY, ...JSON.parse(localStorage.getItem(CACHE) ?? '{}') }
    } catch {
      return EMPTY
    }
  })
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const reload = useCallback(async () => {
    try {
      const fresh = await loadAll()
      setData(fresh)
      setOffline(false)
      try {
        localStorage.setItem(CACHE, JSON.stringify(fresh))
      } catch {
        /* storage full: the app still works online */
      }
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    const again = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', again)
    window.addEventListener('online', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('online', again)
    }
  }, [reload])

  const store = useMemo<Store>(() => {
    const run = async (fn: () => Promise<unknown>) => {
      await fn()
      await reload()
    }
    return {
      ...data,
      loading,
      offline,
      reload,
      saveTask: (t) =>
        run(async () => {
          const { id, ...rest } = t
          const row = toRow(rest)
          check(id ? await db().from('tasks').update(row).eq('id', id) : await db().from('tasks').insert(row))
        }),
      removeTask: async (t) => {
        // A task with finished occurrences is stopped, not deleted, so the achievements log keeps it
        const used = data.done.some((d) => d.taskId === t.id)
        if (used) check(await db().from('tasks').update({ archived_on: iso(new Date()) }).eq('id', t.id))
        else check(await db().from('tasks').delete().eq('id', t.id))
        await reload()
        return used ? 'stopped' : 'deleted'
      },
      restoreTask: (t) => run(async () => check(await db().from('tasks').update({ archived_on: null }).eq('id', t.id))),
      setDone: async (task, date, done) => {
        // Show the tick at once; the server confirms with the reload
        setData((d) => ({
          ...d,
          done: done
            ? [...d.done, { id: `tmp-${task.id}-${date}`, taskId: task.id, dueDate: date, doneAt: new Date().toISOString(), note: null }]
            : d.done.filter((x) => !(x.taskId === task.id && x.dueDate === date)),
        }))
        try {
          if (done) check(await db().from('task_done').upsert({ task_id: task.id, due_date: date }, { onConflict: 'task_id,due_date' }))
          else check(await db().from('task_done').delete().eq('task_id', task.id).eq('due_date', date))
        } finally {
          await reload()
        }
      },
      setDoneNote: (d, note) =>
        run(async () => check(await db().from('task_done').update({ note: note.trim() || null }).eq('id', d.id))),
      saveGoal: (g) =>
        run(async () => {
          const { id, ...rest } = g
          const row = toRow(rest)
          check(id ? await db().from('goals').update(row).eq('id', id) : await db().from('goals').insert(row))
        }),
      removeGoal: (g) => run(async () => check(await db().from('goals').delete().eq('id', g.id))),
      addEntry: (e) => run(async () => check(await db().from('goal_entries').insert(toRow({ ...e })))),
      removeEntry: (e) => run(async () => check(await db().from('goal_entries').delete().eq('id', e.id))),
    }
  }, [data, loading, offline, reload])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

/** Today as YYYY-MM-DD, refreshed when the app is reopened on another day. */
export function useToday(): string {
  const [today, setToday] = useState(() => iso(new Date()))
  useEffect(() => {
    const tick = () => setToday(iso(new Date()))
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return today
}

export { day, iso }
