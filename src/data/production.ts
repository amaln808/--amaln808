import { toCamel } from './case'
import { db } from './client'
import { INVENTORY_KEY, type Lot, toLot } from './inventory'
import { invalidate } from './useQuery'

export interface RecipeComponent {
  itemId: string
  qtyPerUnit: number
}

export interface Recipe {
  id: string
  productId: string
  isEstimate: boolean
  notes: string | null
  components: RecipeComponent[]
}

export const PRODUCTION_KEY = 'production'

export async function fetchRecipes(): Promise<Recipe[]> {
  const [r, c] = await Promise.all([db().from('recipes').select('*'), db().from('recipe_components').select('*')])
  if (r.error) throw r.error
  if (c.error) throw c.error
  return r.data.map((x) => ({
    id: x.id as string,
    productId: x.product_id as string,
    isEstimate: x.is_estimate as boolean,
    notes: x.notes as string | null,
    components: c.data
      .filter((k) => k.recipe_id === x.id)
      .map((k) => ({ itemId: k.item_id as string, qtyPerUnit: Number(k.qty_per_unit) })),
  }))
}

export async function saveRecipe(productId: string, components: RecipeComponent[], isEstimate: boolean) {
  const { error } = await db().rpc('save_recipe', {
    p_product: productId,
    p_components: components.map((c) => ({ item_id: c.itemId, qty_per_unit: c.qtyPerUnit })),
    p_is_estimate: isEstimate,
  })
  if (error) throw error
  invalidate(PRODUCTION_KEY)
  invalidate('products')
}

export interface Batch {
  id: string
  batchNo: string
  productId: string
  productionDate: string
  expiryDate: string | null
  qtyProduced: number
  materialsCostBaisa: number
  extraCostBaisa: number
  totalCostBaisa: number
  unitCostBaisa: number
  outputLotId: string | null
  notes: string | null
}

const toBatch = (r: Record<string, unknown>): Batch => {
  const c = toCamel(r) as unknown as Batch
  return {
    ...c,
    qtyProduced: Number(c.qtyProduced),
    materialsCostBaisa: Number(c.materialsCostBaisa),
    extraCostBaisa: Number(c.extraCostBaisa),
    totalCostBaisa: Number(c.totalCostBaisa),
    unitCostBaisa: Number(c.unitCostBaisa),
  }
}

export async function fetchBatches(): Promise<Array<Batch & { qcStatus: Lot['qcStatus'] | null; remaining: number }>> {
  const [b, lots] = await Promise.all([
    db().from('production_batches').select('*').order('production_date', { ascending: false }).order('batch_no', { ascending: false }),
    db().from('stock_lots').select('id, qc_status, qty_remaining').eq('source_type', 'production'),
  ])
  if (b.error) throw b.error
  if (lots.error) throw lots.error
  const byLot = new Map(lots.data.map((l) => [l.id as string, l]))
  return b.data.map((r) => {
    const batch = toBatch(r)
    const lot = batch.outputLotId ? byLot.get(batch.outputLotId) : undefined
    return { ...batch, qcStatus: (lot?.qc_status as Lot['qcStatus']) ?? null, remaining: Number(lot?.qty_remaining ?? 0) }
  })
}

export interface ConsumptionRow {
  itemId: string
  lot: Lot
  qty: number
  unitCostBaisa: number
}

export async function fetchBatchDetail(id: string) {
  const b = await db().from('production_batches').select('*').eq('id', id).single()
  if (b.error) throw b.error
  const batch = toBatch(b.data)
  const [cons, out] = await Promise.all([
    db().from('batch_consumption').select('*, stock_lots(*)').eq('batch_id', id),
    batch.outputLotId ? db().from('stock_lots').select('*').eq('id', batch.outputLotId).single() : Promise.resolve({ data: null, error: null }),
  ])
  if (cons.error) throw cons.error
  if (out.error) throw out.error
  return {
    batch,
    outputLot: out.data ? toLot(out.data) : null,
    consumption: cons.data.map((c) => ({
      itemId: c.item_id as string,
      lot: toLot(c.stock_lots as Record<string, unknown>),
      qty: Number(c.qty),
      unitCostBaisa: Number(c.unit_cost_baisa),
    })),
  }
}

export async function createBatch(p: {
  productId: string
  productionDate: string
  expiryDate: string | null
  qtyProduced: number
  extraCostBaisa: number
  notes: string | null
  consumption: Array<{ itemId: string; qty: number }>
}): Promise<string> {
  const { data, error } = await db().rpc('create_production_batch', {
    p: {
      product_id: p.productId,
      production_date: p.productionDate,
      expiry_date: p.expiryDate,
      qty_produced: p.qtyProduced,
      extra_cost_baisa: p.extraCostBaisa,
      notes: p.notes,
      consumption: p.consumption.map((c) => ({ item_id: c.itemId, qty: c.qty })),
    },
  })
  if (error) throw error
  invalidate(PRODUCTION_KEY)
  invalidate(INVENTORY_KEY)
  invalidate('item:')
  invalidate('products')
  return data as string
}

export async function deleteBatch(id: string) {
  const { error } = await db().rpc('delete_production_batch', { p_id: id })
  if (error) throw error
  invalidate(PRODUCTION_KEY)
  invalidate(INVENTORY_KEY)
  invalidate('item:')
  invalidate('products')
}
