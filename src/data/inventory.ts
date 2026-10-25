import type { Unit } from '../domain/quantity'
import { toCamel, toSnake } from './case'
import { db } from './client'
import { enqueue, flushOutbox, registerOutboxHandler } from './outbox'
import { invalidate } from './useQuery'

export type ItemType = 'raw' | 'packaging' | 'finished'
export type PaymentMethod = 'cash' | 'bank' | 'card' | 'other'

export interface Item {
  id: string
  type: ItemType
  name: string
  nameEn: string | null
  unit: Unit
  sku: string | null
  minQty: number
  requiresExpiry: boolean
  description: string | null
  weightG: number | null
  photoPath: string | null
  shelfLifeDays: number | null
  vatRate: number | null
  active: boolean
}

export interface StockRow {
  qty: number
  usableQty: number
  expiredQty: number
  valueBaisa: number
  nearestExpiry: string | null
  sellableQty: number
}

export interface ItemWithStock extends Item {
  stock: StockRow
}

export interface Lot {
  id: string
  itemId: string
  lotCode: string | null
  sourceType: 'purchase' | 'production' | 'opening' | 'adjustment'
  sourceId: string | null
  receivedDate: string
  expiryDate: string | null
  qtyIn: number
  qtyRemaining: number
  unitCostBaisa: number
  qcStatus: 'na' | 'pending' | 'passed' | 'failed'
}

export interface Movement {
  id: string
  lotId: string
  date: string
  type: string
  qty: number
  unitCostBaisa: number
  refType: string
  refId: string | null
  notes: string | null
  createdAt: string
}

/** Postgres numeric/bigint arrive as strings; these turn a row's numbers back into numbers. */
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export function toItem(r: Record<string, unknown>): Item {
  const c = toCamel(r) as unknown as Item
  return { ...c, minQty: Number(c.minQty), weightG: num(c.weightG), vatRate: num(c.vatRate) }
}

export function toLot(r: Record<string, unknown>): Lot {
  const c = toCamel(r) as unknown as Lot
  return { ...c, qtyIn: Number(c.qtyIn), qtyRemaining: Number(c.qtyRemaining), unitCostBaisa: Number(c.unitCostBaisa) }
}

const EMPTY_STOCK: StockRow = { qty: 0, usableQty: 0, expiredQty: 0, valueBaisa: 0, nearestExpiry: null, sellableQty: 0 }

export const INVENTORY_KEY = 'inventory'

export async function fetchItemsWithStock(): Promise<ItemWithStock[]> {
  const [items, stock] = await Promise.all([db().from('items').select('*').order('name'), db().from('v_stock').select('*')])
  if (items.error) throw items.error
  if (stock.error) throw stock.error
  const byItem = new Map(
    stock.data.map((s) => [
      s.item_id as string,
      {
        qty: Number(s.qty),
        usableQty: Number(s.usable_qty),
        expiredQty: Number(s.expired_qty),
        valueBaisa: Number(s.value_baisa),
        nearestExpiry: s.nearest_expiry as string | null,
        sellableQty: Number(s.sellable_qty),
      },
    ]),
  )
  return items.data.map((r) => {
    const item = toItem(r)
    return { ...item, stock: byItem.get(item.id) ?? EMPTY_STOCK }
  })
}

/** All lots with stock left (for alerts and FEFO previews). */
export async function fetchOpenLots(): Promise<Lot[]> {
  const { data, error } = await db().from('stock_lots').select('*').gt('qty_remaining', 0)
  if (error) throw error
  return data.map(toLot)
}

export async function fetchItemDetail(id: string) {
  const [item, lots, moves] = await Promise.all([
    db().from('items').select('*').eq('id', id).single(),
    db().from('stock_lots').select('*').eq('item_id', id).order('received_date', { ascending: false }),
    db().from('stock_movements').select('*').eq('item_id', id).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(200),
  ])
  if (item.error) throw item.error
  if (lots.error) throw lots.error
  if (moves.error) throw moves.error
  return {
    item: toItem(item.data),
    lots: lots.data.map(toLot),
    movements: moves.data.map((m) => {
      const c = toCamel(m) as unknown as Movement
      return { ...c, qty: Number(c.qty), unitCostBaisa: Number(c.unitCostBaisa) }
    }),
  }
}

export type ItemDraft = Omit<Item, 'id'> & { id?: string }

export async function saveItem(item: ItemDraft): Promise<string> {
  const row = toSnake({ ...item })
  const q = item.id ? db().from('items').update(row).eq('id', item.id) : db().from('items').insert(row)
  const { data, error } = await q.select('id').single()
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate('item:')
  invalidate('products')
  return data.id as string
}

export async function addOpeningStock(p: {
  itemId: string
  qty: number
  unitCostBaisa: number
  date: string
  expiryDate: string | null
  lotCode: string | null
  notes?: string | null
}) {
  const { error } = await db().rpc('add_opening_stock', {
    p_item: p.itemId,
    p_qty: p.qty,
    p_unit_cost: p.unitCostBaisa,
    p_date: p.date,
    p_expiry: p.expiryDate,
    p_lot_code: p.lotCode,
    p_notes: p.notes ?? null,
  })
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate('item:')
}

export async function adjustLot(lotId: string, delta: number, type: 'adjustment' | 'waste', date: string, notes: string | null) {
  const { error } = await db().rpc('adjust_lot', { p_lot: lotId, p_delta: delta, p_type: type, p_date: date, p_notes: notes })
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate('item:')
}

// ── Suppliers ───────────────────────────────────────────────────────

export interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  vatNo: string | null
  /** Free text the owner types (e.g. «تمور», «عبوات»); earlier values are offered as choices. */
  kind: string | null
  notes: string | null
  active: boolean
}

export interface SupplierWithBalance extends Supplier {
  purchasedBaisa: number
  paidBaisa: number
  dueBaisa: number
}

export const SUPPLIERS_KEY = 'suppliers'

export async function fetchSuppliers(): Promise<SupplierWithBalance[]> {
  const [s, p, pay] = await Promise.all([
    db().from('suppliers').select('*').order('name'),
    db().from('purchases').select('supplier_id, total_baisa'),
    db().from('supplier_payments').select('supplier_id, amount_baisa'),
  ])
  for (const r of [s, p, pay]) if (r.error) throw r.error
  const sum = (rows: Array<Record<string, unknown>>, key: string) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.supplier_id as string, (m.get(r.supplier_id as string) ?? 0) + Number(r[key]))
    return m
  }
  const bought = sum(p.data!, 'total_baisa')
  const paid = sum(pay.data!, 'amount_baisa')
  return s.data!.map((r) => {
    const sup = toCamel(r) as unknown as Supplier
    const purchasedBaisa = bought.get(sup.id) ?? 0
    const paidBaisa = paid.get(sup.id) ?? 0
    return { ...sup, purchasedBaisa, paidBaisa, dueBaisa: purchasedBaisa - paidBaisa }
  })
}

export interface PurchaseRow {
  id: string
  supplierId: string
  date: string
  supplierInvoiceNo: string | null
  subtotalBaisa: number
  vatBaisa: number
  totalBaisa: number
  attachmentPath: string | null
  notes: string | null
}

export interface SupplierPayment {
  id: string
  supplierId: string
  purchaseId: string | null
  date: string
  amountBaisa: number
  method: PaymentMethod
  notes: string | null
}

const toPurchase = (r: Record<string, unknown>): PurchaseRow => {
  const c = toCamel(r) as unknown as PurchaseRow
  return { ...c, subtotalBaisa: Number(c.subtotalBaisa), vatBaisa: Number(c.vatBaisa), totalBaisa: Number(c.totalBaisa) }
}
const toPayment = (r: Record<string, unknown>): SupplierPayment => {
  const c = toCamel(r) as unknown as SupplierPayment
  return { ...c, amountBaisa: Number(c.amountBaisa) }
}

export async function fetchSupplierDetail(id: string) {
  const [s, p, pay] = await Promise.all([
    db().from('suppliers').select('*').eq('id', id).single(),
    db().from('purchases').select('*').eq('supplier_id', id).order('date', { ascending: false }),
    db().from('supplier_payments').select('*').eq('supplier_id', id).order('date', { ascending: false }),
  ])
  for (const r of [s, p, pay]) if (r.error) throw r.error
  return {
    supplier: toCamel(s.data!) as unknown as Supplier,
    purchases: p.data!.map(toPurchase),
    payments: pay.data!.map(toPayment),
  }
}

export type SupplierDraft = Omit<Supplier, 'id'> & { id?: string }

export async function saveSupplier(s: SupplierDraft): Promise<string> {
  const row = toSnake({ ...s })
  const q = s.id ? db().from('suppliers').update(row).eq('id', s.id) : db().from('suppliers').insert(row)
  const { data, error } = await q.select('id').single()
  if (error) throw error
  invalidate(SUPPLIERS_KEY)
  invalidate('supplier:')
  return data.id as string
}

interface PaymentPayload {
  supplierId: string
  purchaseId: string | null
  date: string
  amountBaisa: number
  method: PaymentMethod
  notes: string | null
}

// Supplier payments can be recorded offline; the outbox id becomes the row id.
registerOutboxHandler<PaymentPayload>('supplier.payment', async (p, entry) => {
  const { error } = await db()
    .from('supplier_payments')
    .upsert(
      {
        id: entry.id,
        supplier_id: p.supplierId,
        purchase_id: p.purchaseId,
        date: p.date,
        amount_baisa: p.amountBaisa,
        method: p.method,
        notes: p.notes,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (error) throw error
  invalidate(SUPPLIERS_KEY)
  invalidate('supplier:')
  invalidate('purchase:')
})

export async function recordSupplierPayment(p: PaymentPayload) {
  await enqueue('supplier.payment', p)
  await flushOutbox()
}

export async function deleteSupplierPayment(id: string) {
  const { error } = await db().from('supplier_payments').delete().eq('id', id)
  if (error) throw error
  invalidate(SUPPLIERS_KEY)
  invalidate('supplier:')
  invalidate('purchase:')
}

// ── Purchases ───────────────────────────────────────────────────────

export interface PurchaseLineInput {
  /** An existing item, or null with itemName/itemType/unit to create it in the same save. */
  itemId: string | null
  itemName?: string
  itemType?: 'raw' | 'packaging'
  unit?: Unit
  qty: number
  unitCostBaisa: number
  vatRate: number
  supplierLotCode: string | null
  expiryDate: string | null
}

export async function createPurchase(p: {
  /** An existing supplier, or null with supplierName to create it in the same save. */
  supplierId: string | null
  supplierName: string
  date: string
  supplierInvoiceNo: string | null
  notes: string | null
  attachmentPath: string | null
  paidBaisa: number
  method: PaymentMethod
  lines: PurchaseLineInput[]
}): Promise<string> {
  const { data, error } = await db().rpc('create_purchase_named', {
    p: {
      supplier_id: p.supplierId,
      supplier_name: p.supplierName,
      date: p.date,
      supplier_invoice_no: p.supplierInvoiceNo,
      notes: p.notes,
      attachment_path: p.attachmentPath,
      paid_baisa: p.paidBaisa,
      method: p.method,
      lines: p.lines.map((l) => toSnake({ ...l })),
    },
  })
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate(SUPPLIERS_KEY)
  invalidate('supplier:')
  invalidate('item:')
  return data as string
}

/** Last unit price (before VAT) and VAT rate paid per item, to prefill the next purchase. */
export async function fetchLastPurchasePrices(): Promise<Map<string, { unitCostBaisa: number; vatRate: number }>> {
  const { data, error } = await db()
    .from('purchase_lines')
    .select('item_id, unit_cost_baisa, vat_rate')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  const m = new Map<string, { unitCostBaisa: number; vatRate: number }>()
  for (const r of data) if (!m.has(r.item_id)) m.set(r.item_id, { unitCostBaisa: Number(r.unit_cost_baisa), vatRate: Number(r.vat_rate) })
  return m
}

export async function fetchPurchaseDetail(id: string) {
  const [p, lines, pay] = await Promise.all([
    db().from('purchases').select('*').eq('id', id).single(),
    db().from('purchase_lines').select('*').eq('purchase_id', id),
    db().from('supplier_payments').select('*').eq('purchase_id', id).order('date'),
  ])
  for (const r of [p, lines, pay]) if (r.error) throw r.error
  return {
    purchase: toPurchase(p.data!),
    lines: lines.data!.map((l) => ({
      id: l.id as string,
      itemId: l.item_id as string,
      qty: Number(l.qty),
      unitCostBaisa: Number(l.unit_cost_baisa),
      vatRate: Number(l.vat_rate),
      supplierLotCode: l.supplier_lot_code as string | null,
      expiryDate: l.expiry_date as string | null,
    })),
    payments: pay.data!.map(toPayment),
  }
}

export async function deletePurchase(id: string) {
  const { error } = await db().rpc('delete_purchase', { p_id: id })
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate(SUPPLIERS_KEY)
  invalidate('supplier:')
  invalidate('item:')
}

// ── Demo data ───────────────────────────────────────────────────────

export async function loadDemoData() {
  const { error } = await db().rpc('load_demo_data')
  if (error) throw error
  invalidate('')
}

export async function resetAllData() {
  const { error } = await db().rpc('reset_all_data')
  if (error) throw error
  invalidate('')
}

/**
 * «حذف»: an item with no history is deleted for good; one with stock, purchases,
 * batches or sales is hidden from the lists instead, keeping its records.
 */
export async function deleteItem(id: string): Promise<'deleted' | 'hidden'> {
  const { data, error } = await db().rpc('delete_item', { p_id: id })
  if (error) throw error
  invalidate(INVENTORY_KEY)
  invalidate('item:')
  invalidate('products')
  invalidate('production')
  invalidate('sales')
  return data as 'deleted' | 'hidden'
}
