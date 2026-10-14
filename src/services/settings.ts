import type { FactoryDB } from '../db/db'
import { SETTINGS_ID } from '../db/seed'
import type { Settings } from '../db/types'
import { UserError } from './errors'

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'createdAt' | 'updatedAt' | 'currency'>>

export async function updateSettings(db: FactoryDB, patch: SettingsPatch): Promise<void> {
  if (patch.businessName !== undefined && !patch.businessName.trim()) throw new UserError('اسم المشروع مطلوب')
  if (patch.vatRatePercent !== undefined && !(patch.vatRatePercent >= 0 && patch.vatRatePercent <= 100))
    throw new UserError('نسبة الضريبة غير صحيحة')
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get(SETTINGS_ID)
    if (!s) throw new UserError('الإعدادات غير موجودة')
    await db.settings.put({ ...s, ...patch, updatedAt: new Date().toISOString() })
  })
}

/** Reserves the next number of a document series inside the caller's transaction. */
export async function takeNumber(
  db: FactoryDB,
  series: 'nextInvoiceNo' | 'nextQuoteNo' | 'nextBatchNo',
): Promise<{ settings: Settings; seq: number }> {
  const settings = await db.settings.get(SETTINGS_ID)
  if (!settings) throw new UserError('الإعدادات غير موجودة')
  const seq = settings[series] ?? 1
  await db.settings.put({ ...settings, [series]: seq + 1, updatedAt: new Date().toISOString() })
  return { settings, seq }
}
