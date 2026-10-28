import { toCamel, toSnake } from './case'
import { db } from './client'
import { DASHBOARD_KEY } from './dashboard'
import { invalidate } from './useQuery'

export interface Asset {
  id: string
  name: string
  category: string | null
  purchaseDate: string
  costBaisa: number
  lifeMonths: number
  residualBaisa: number
  filePath: string | null
  notes: string | null
  active: boolean
}
export type AssetDraft = Omit<Asset, 'id'> & { id?: string }

export const ASSETS_KEY = 'assets'

export async function fetchAssets(): Promise<Asset[]> {
  const { data, error } = await db().from('assets').select('*').order('purchase_date').order('name')
  if (error) throw error
  return data.map((r) => {
    const a = toCamel(r) as unknown as Asset
    return { ...a, costBaisa: Number(a.costBaisa), residualBaisa: Number(a.residualBaisa), lifeMonths: Number(a.lifeMonths) }
  })
}

function changed() {
  invalidate(ASSETS_KEY)
  invalidate(DASHBOARD_KEY)
}

export async function saveAsset(a: AssetDraft): Promise<void> {
  const { id, ...rest } = a
  const row = toSnake(rest as Record<string, unknown>)
  const { error } = id ? await db().from('assets').update(row).eq('id', id) : await db().from('assets').insert(row)
  if (error) throw error
  changed()
}

export async function deleteAsset(id: string) {
  const { error } = await db().from('assets').delete().eq('id', id)
  if (error) throw error
  changed()
}
