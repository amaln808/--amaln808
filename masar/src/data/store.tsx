/**
 * Demo-phase data store: the whole company lives in the browser (localStorage) so the app can be
 * tried right away. Phase 2 swaps this for Supabase behind the same `save` / `remove` calls.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Collection, Db, Employee } from '../domain/types'
import { todayIso } from '../domain/dates'
import { buildDemo } from './demo'

const KEY = 'masar-demo-v1'
const USER_KEY = 'masar-user'

type Row<C extends Collection> = Db[C][number]

interface Store {
  db: Db
  today: string
  me: Employee | null
  signIn: (id: string) => void
  signOut: () => void
  save: <C extends Collection>(c: C, row: Row<C>) => void
  remove: <C extends Collection>(c: C, id: string) => void
  setOrg: (patch: Partial<Db['org']>) => void
  dismiss: (noticeId: string) => void
  resetDemo: () => void
}

const Ctx = createContext<Store | null>(null)

function load(today: string): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    /* fall through to a fresh demo */
  }
  return buildDemo(today)
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export function StoreProvider({ children }: { children: ReactNode }) {
  const today = todayIso()
  const [db, setDb] = useState<Db>(() => load(today))
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(db))
  }, [db])

  const save = useCallback(<C extends Collection>(c: C, row: Row<C>) => {
    setDb((d) => {
      const list = d[c] as Row<C>[]
      const i = list.findIndex((x) => x.id === row.id)
      const next = i < 0 ? [...list, row] : list.map((x) => (x.id === row.id ? row : x))
      return { ...d, [c]: next }
    })
  }, [])
  const remove = useCallback(<C extends Collection>(c: C, id: string) => {
    setDb((d) => ({ ...d, [c]: (d[c] as Row<C>[]).filter((x) => x.id !== id) }))
  }, [])

  const value = useMemo<Store>(
    () => ({
      db,
      today,
      me: db.employees.find((e) => e.id === userId && e.active) ?? null,
      signIn: (id) => {
        localStorage.setItem(USER_KEY, id)
        setUserId(id)
      },
      signOut: () => {
        localStorage.removeItem(USER_KEY)
        setUserId(null)
      },
      save,
      remove,
      setOrg: (patch) => setDb((d) => ({ ...d, org: { ...d.org, ...patch } })),
      dismiss: (id) => setDb((d) => ({ ...d, readNotices: [...d.readNotices, id] })),
      resetDemo: () => setDb(buildDemo(today)),
    }),
    [db, today, userId, save, remove],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
/** The signed-in employee (pages only render once someone is signed in) */
export function useMe() {
  return useStore().me!
}
