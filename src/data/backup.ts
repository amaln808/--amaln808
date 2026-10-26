import type { Backup } from '../features/backup/format'
import { db } from './client'
import { invalidate } from './useQuery'
import { updateSettings } from './settings'

/** Every business table in one answer from the database. */
export async function exportBackup(): Promise<Backup> {
  const { data, error } = await db().rpc('export_backup')
  if (error) throw error
  return data as Backup
}

/** Remembers the backup date (for the weekly reminder). */
export async function markBackedUp() {
  await updateSettings({ lastBackupAt: new Date().toISOString() })
}

/** Replaces all data with the backup in one transaction (owner only). */
export async function restoreBackup(b: Backup) {
  const { error } = await db().rpc('restore_backup', { p: b })
  if (error) throw error
  invalidate('')
}

/** True once anything worth backing up exists (the reminder waits until then). */
export async function hasRecords(): Promise<boolean> {
  const checks = await Promise.all(
    ['sales_invoices', 'purchases', 'expenses', 'production_batches'].map((t) => db().from(t).select('id', { head: true, count: 'exact' }).limit(1)),
  )
  return checks.some((r) => (r.count ?? 0) > 0)
}
