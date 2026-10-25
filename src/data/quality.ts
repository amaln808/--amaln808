import { toCamel } from './case'
import { db } from './client'
import { INVENTORY_KEY } from './inventory'
import { PRODUCTION_KEY } from './production'
import { invalidate } from './useQuery'

export type QcResult = 'pending' | 'pass' | 'fail'

export interface QualityCheck {
  id: string
  batchId: string
  checkDate: string
  labName: string | null
  /** Postgres numeric arrives as text */
  moisturePct: string | null
  aflatoxinPpb: string | null
  result: QcResult
  certificatePath: string | null
  notes: string | null
  createdAt: string
}

export const QUALITY_KEY = `${PRODUCTION_KEY}:quality`

/** All checks, newest first (one query serves the quality page and each batch). */
export async function fetchQualityChecks(): Promise<QualityCheck[]> {
  const { data, error } = await db()
    .from('quality_checks')
    .select('*')
    .order('check_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => toCamel(r) as unknown as QualityCheck)
}

export type QualityCheckDraft = Omit<QualityCheck, 'id' | 'createdAt'> & { id?: string }

/** Saves a check; the batch's stock follows its latest result (pass → can be sold). */
export async function saveQualityCheck(c: QualityCheckDraft): Promise<string> {
  const { data, error } = await db().rpc('record_quality_check', {
    p: {
      id: c.id ?? null,
      batch_id: c.batchId,
      check_date: c.checkDate,
      lab_name: c.labName,
      moisture_pct: c.moisturePct,
      aflatoxin_ppb: c.aflatoxinPpb,
      result: c.result,
      certificate_path: c.certificatePath,
      notes: c.notes,
    },
  })
  if (error) throw error
  invalidateQuality()
  return data as string
}

export async function deleteQualityCheck(id: string) {
  const { error } = await db().rpc('delete_quality_check', { p_id: id })
  if (error) throw error
  invalidateQuality()
}

function invalidateQuality() {
  invalidate(PRODUCTION_KEY)
  invalidate(INVENTORY_KEY)
  invalidate('batch:')
  invalidate('item:')
  invalidate('products')
}
