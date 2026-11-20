import { toCamel } from './case'
import { all, db } from './client'
import { DASHBOARD_KEY } from './dashboard'
import { INVENTORY_KEY } from './inventory'
import { invalidate } from './useQuery'

export const SAMPLES_KEY = 'samples'

/** Jars given away to promote the product: taken from ready stock without an invoice. */
export interface Sample {
  id: string
  date: string
  productId: string
  qty: number
  recipient: string
  customerId: string | null
  /** What the jars cost (FIFO), counted as promotion in profit */
  costBaisa: number
  notes: string | null
}

export async function fetchSamples(): Promise<Sample[]> {
  const { data, error } = await all(() => db().from('samples').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }))
  if (error) throw error
  return data.map((r) => {
    const s = toCamel(r) as unknown as Sample
    return { ...s, qty: Number(s.qty), costBaisa: Number(s.costBaisa) }
  })
}

function changed() {
  invalidate(SAMPLES_KEY)
  invalidate(INVENTORY_KEY)
  invalidate(DASHBOARD_KEY)
  invalidate('item:')
  invalidate('batch:')
}

export async function giveSamples(p: { productId: string; qty: number; recipient: string; date: string; notes: string | null }): Promise<string> {
  const { data, error } = await db().rpc('give_samples', {
    p: { product_id: p.productId, qty: p.qty, recipient: p.recipient, date: p.date, notes: p.notes },
  })
  if (error) throw error
  changed()
  return data as string
}

/** Removes the record and puts the jars back into the lots they came from. */
export async function deleteSamples(id: string) {
  const { error } = await db().rpc('delete_samples', { p_id: id })
  if (error) throw error
  changed()
}
