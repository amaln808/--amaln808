import { toCamel, toSnake } from './case'
import { db } from './client'
import { invalidate } from './useQuery'

export type ThemeMode = 'light' | 'dark' | 'system'
export type FontScale = 'sm' | 'md' | 'lg' | 'xl'

export interface Settings {
  companyName: string
  companyNameEn: string | null
  phone: string | null
  email: string | null
  crNo: string | null
  vatNo: string | null
  address: string | null
  addressEn: string | null
  logoPath: string | null
  stampPath: string | null
  signaturePath: string | null
  vatRegistered: boolean
  /** Postgres numeric arrives as text */
  defaultVatRate: string
  invoicePrefix: string
  quotePrefix: string
  batchPrefix: string
  invoiceDueDays: number
  quoteValidityDays: number
  expiryAlertDays: number
  maxMoisturePct: string | null
  maxAflatoxinPpb: string | null
  themePrimary: string
  themeMode: ThemeMode
  fontScale: FontScale
  uiLanguage: 'ar' | 'en'
  docLanguage: 'ar' | 'en' | 'both'
  lastBackupAt: string | null
  updatedAt: string
}

export const SETTINGS_KEY = 'settings'

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await db().from('settings').select('*').eq('id', 1).single()
  if (error) throw error
  return toCamel(data) as unknown as Settings
}

export async function updateSettings(patch: Partial<Settings>) {
  const { error } = await db().from('settings').update(toSnake(patch)).eq('id', 1)
  if (error) throw error
  invalidate(SETTINGS_KEY)
}

export interface StorageUsage {
  dbBytes: number
  filesBytes: number
  filesCount: number
}

/** Free plan limits: 500 MB database, 1 GB files. */
export const FREE_DB_BYTES = 500 * 1024 * 1024
export const FREE_FILES_BYTES = 1024 * 1024 * 1024

export async function fetchStorageUsage(): Promise<StorageUsage> {
  const { data, error } = await db().rpc('storage_usage').single<{ db_bytes: number; files_bytes: number; files_count: number }>()
  if (error) throw error
  return { dbBytes: Number(data.db_bytes), filesBytes: Number(data.files_bytes), filesCount: Number(data.files_count) }
}
