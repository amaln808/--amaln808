import { TriangleAlert } from 'lucide-react'
import { ar } from '../i18n/ar'
import { usePersistentStorage } from './storage'

/** Warns when the browser has not granted persistent storage. */
export function StorageBanner() {
  const state = usePersistentStorage()
  if (state !== 'not-persisted') return null
  return (
    <div className="mb-5 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <TriangleAlert className="size-5 shrink-0" />
      <p>{ar.storage.notPersisted}</p>
    </div>
  )
}
