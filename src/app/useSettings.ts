import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { SETTINGS_ID } from '../db/seed'

export function useSettings() {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID), [])
}
