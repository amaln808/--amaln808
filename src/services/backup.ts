import { t } from '../i18n/index'
import type { FactoryDB } from '../db/db'
import { SETTINGS_ID, seedIfEmpty, upgradeSettings } from '../db/seed'
import type { Settings } from '../db/types'
import { type BackupData, TABLES } from '../features/backup/format'
import { UserError } from './errors'
import { seedEstimatedRecipes } from './recipes'

const tablesOf = (db: FactoryDB) => TABLES.map((t) => db.table(t.table))

export async function collectBackup(db: FactoryDB): Promise<BackupData> {
  const out: BackupData = {}
  await db.transaction('r', tablesOf(db), async () => {
    for (const t of TABLES) out[t.table] = await db.table(t.table).toArray()
  })
  return out
}

export async function markBackedUp(db: FactoryDB, at = new Date().toISOString()): Promise<void> {
  await db.settings.update(SETTINGS_ID, { lastBackupAt: at })
}

/** Replaces every table with the backup's contents, all or nothing. */
export async function restoreBackup(db: FactoryDB, data: BackupData): Promise<void> {
  const settings = data.settings?.[0] as Partial<Settings> | undefined
  if (!settings) throw new UserError(t("النسخة لا تحتوي على الإعدادات", "The backup has no settings"))
  await db.transaction('rw', tablesOf(db), async () => {
    for (const t of TABLES) {
      const table = db.table(t.table)
      await table.clear()
      const rows = t.table === 'settings' ? [{ ...settings, ...upgradeSettings(settings), id: SETTINGS_ID }] : data[t.table] ?? []
      if (rows.length) await table.bulkAdd(rows)
    }
  })
}

/** Deletes everything and starts again with the starter data. */
export async function clearAllData(db: FactoryDB): Promise<void> {
  await db.transaction('rw', tablesOf(db), async () => {
    for (const t of TABLES) await db.table(t.table).clear()
  })
  await seedIfEmpty(db)
  await seedEstimatedRecipes(db)
}
