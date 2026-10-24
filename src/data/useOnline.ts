import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { local } from './local'

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** Changes saved on the iPad that have not reached the server yet. */
export function useOutboxCounts() {
  return (
    useLiveQuery(async () => {
      const all = await local.outbox.toArray()
      return {
        pending: all.filter((e) => e.status === 'pending').length,
        failed: all.filter((e) => e.status === 'failed').length,
      }
    }, []) ?? { pending: 0, failed: 0 }
  )
}
