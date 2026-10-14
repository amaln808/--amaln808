import { useEffect, useState } from 'react'

export type PersistState = 'persisted' | 'not-persisted' | 'unknown'

/**
 * Asks the browser to keep IndexedDB data from being evicted. Safari grants this
 * mainly for apps added to the home screen, so the result is surfaced to the user.
 */
export function usePersistentStorage(): PersistState {
  const [state, setState] = useState<PersistState>('unknown')
  useEffect(() => {
    const storage = navigator.storage
    if (!storage?.persisted) return
    let cancelled = false
    ;(async () => {
      let ok = await storage.persisted()
      if (!ok && storage.persist) ok = await storage.persist()
      if (!cancelled) setState(ok ? 'persisted' : 'not-persisted')
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export const BACKUP_REMINDER_DAYS = 7

export function isBackupOverdue(lastBackupAt: string | undefined, now = new Date()): boolean {
  if (!lastBackupAt) return true
  const days = (now.getTime() - new Date(lastBackupAt).getTime()) / 86_400_000
  return days > BACKUP_REMINDER_DAYS
}
