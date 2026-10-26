import { isLowStock, stockValue } from './inventory'
import { lineTotal } from './money'
import { type DateRange, inRange, totalsBy } from './periods'
import { netRevenue } from './sales'

/** Minimal shapes so the calculations stay independent of the database layer. */
export interface DashInvoice {
  id: string
  customerId: string
  /** Channel at the time of sale */
  channelId?: string | null
  date: string
  subtotalBaisa: number
  discountBaisa: number
  totalBaisa: number
  lines: Array<{ itemId: string; qty: number; unitPriceBaisa: number; unitCostBaisa: number }>
}
export interface DashPayment {
  date: string
  amountBaisa: number
  customerId?: string
  supplierId?: string
}
export interface DashExpense {
  date: string
  amountBaisa: number
  categoryId: string
}
export interface DashBatch {
  date: string
  qtyProduced: number
  totalCostBaisa: number
}
export interface DashItem {
  id: string
  type: 'raw' | 'packaging' | 'finished'
  active: boolean
  qtyOnHand: number
  minQty: number
  avgCostBaisa: number
}
export interface DashPurchase {
  supplierId: string
  totalBaisa: number
}

export interface DashboardInput {
  invoices: DashInvoice[]
  customerPayments: DashPayment[]
  supplierPayments: DashPayment[]
  purchases: DashPurchase[]
  expenses: DashExpense[]
  batches: DashBatch[]
  items: DashItem[]
}

/** Invoice revenue (excl. VAT) and cost of the goods it sold. */
export function invoiceRevenue(inv: DashInvoice): number {
  return netRevenue(inv)
}
export function invoiceCogs(inv: DashInvoice): number {
  return inv.lines.reduce((s, l) => s + lineTotal(l.qty, l.unitCostBaisa), 0)
}

const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0)
const ratio = (a: number, b: number) => (b ? a / b : null)

export interface Kpis {
  revenueBaisa: number
  cogsBaisa: number
  grossProfitBaisa: number
  grossMargin: number | null
  expensesBaisa: number
  netProfitBaisa: number
  netMargin: number | null
  unitsProduced: number
  /** Average production cost per unit in the period; null if nothing produced */
  avgUnitCostBaisa: number | null
  unitsSold: number
  invoiceCount: number
  cashInBaisa: number
  cashOutBaisa: number
}

/** Profit uses invoice dates (accrual); cash uses actual payment dates. */
export function computeKpis(d: DashboardInput, r: DateRange): Kpis {
  const inv = d.invoices.filter((i) => inRange(i.date, r))
  const revenueBaisa = sum(inv, invoiceRevenue)
  const cogsBaisa = sum(inv, invoiceCogs)
  const grossProfitBaisa = revenueBaisa - cogsBaisa
  const expensesBaisa = sum(d.expenses.filter((e) => inRange(e.date, r)), (e) => e.amountBaisa)
  const netProfitBaisa = grossProfitBaisa - expensesBaisa
  const batches = d.batches.filter((b) => inRange(b.date, r))
  const unitsProduced = sum(batches, (b) => b.qtyProduced)
  const cashInBaisa = sum(d.customerPayments.filter((p) => inRange(p.date, r)), (p) => p.amountBaisa)
  const cashOutBaisa =
    sum(d.supplierPayments.filter((p) => inRange(p.date, r)), (p) => p.amountBaisa) + expensesBaisa
  return {
    revenueBaisa,
    cogsBaisa,
    grossProfitBaisa,
    grossMargin: ratio(grossProfitBaisa, revenueBaisa),
    expensesBaisa,
    netProfitBaisa,
    netMargin: ratio(netProfitBaisa, revenueBaisa),
    unitsProduced,
    avgUnitCostBaisa: unitsProduced ? Math.round(sum(batches, (b) => b.totalCostBaisa) / unitsProduced) : null,
    unitsSold: sum(inv, (i) => sum(i.lines, (l) => l.qty)),
    invoiceCount: inv.length,
    cashInBaisa,
    cashOutBaisa,
  }
}

export interface MonthRow {
  month: string
  revenueBaisa: number
  costsBaisa: number
  netProfitBaisa: number
  cashInBaisa: number
  cashOutBaisa: number
  netCashBaisa: number
}

/** Per-month profit and cash flow for the given "YYYY-MM" months. */
export function monthlySeries(d: DashboardInput, months: string[]): MonthRow[] {
  return months.map((month) => {
    const r = { from: `${month}-01`, to: `${month}-31` }
    const k = computeKpis(d, r)
    return {
      month,
      revenueBaisa: k.revenueBaisa,
      costsBaisa: k.cogsBaisa + k.expensesBaisa,
      netProfitBaisa: k.netProfitBaisa,
      cashInBaisa: k.cashInBaisa,
      cashOutBaisa: k.cashOutBaisa,
      netCashBaisa: k.cashInBaisa - k.cashOutBaisa,
    }
  })
}

export function topCustomers(d: DashboardInput, r: DateRange, limit = 5) {
  return totalsBy(d.invoices.filter((i) => inRange(i.date, r)), (i) => i.customerId, invoiceRevenue).slice(0, limit)
}

export function topChannels(d: DashboardInput, r: DateRange, limit = 5) {
  return totalsBy(d.invoices.filter((i) => inRange(i.date, r)), (i) => i.channelId ?? '', invoiceRevenue).slice(0, limit)
}

export interface ProductTotal {
  itemId: string
  qty: number
  revenueBaisa: number
}

/** Line revenue is allocated the invoice discount pro rata so totals match revenue. */
export function topProducts(d: DashboardInput, r: DateRange, limit = 5): ProductTotal[] {
  const map = new Map<string, ProductTotal>()
  for (const inv of d.invoices.filter((i) => inRange(i.date, r))) {
    const factor = inv.subtotalBaisa ? (inv.subtotalBaisa - inv.discountBaisa) / inv.subtotalBaisa : 0
    for (const l of inv.lines) {
      const t = map.get(l.itemId) ?? { itemId: l.itemId, qty: 0, revenueBaisa: 0 }
      t.qty += l.qty
      t.revenueBaisa += Math.round(lineTotal(l.qty, l.unitPriceBaisa) * factor)
      map.set(l.itemId, t)
    }
  }
  return [...map.values()].sort((a, b) => b.revenueBaisa - a.revenueBaisa).slice(0, limit)
}

export function expensesByCategory(d: DashboardInput, r: DateRange) {
  return totalsBy(d.expenses.filter((e) => inRange(e.date, r)), (e) => e.categoryId, (e) => e.amountBaisa)
}

/** Current stock value split by item type (active items only). */
export function inventoryValue(items: DashItem[]) {
  const active = items.filter((i) => i.active)
  const by = (t: DashItem['type']) => sum(active.filter((i) => i.type === t), stockValue)
  const raw = by('raw')
  const packaging = by('packaging')
  const finished = by('finished')
  return { raw, packaging, finished, total: raw + packaging + finished }
}

export function lowStockItems<T extends DashItem>(items: T[]): T[] {
  return items.filter((i) => i.active && isLowStock(i))
}

/** Current outstanding totals (not period-bound): owed to us, owed by us. */
export function outstanding(d: DashboardInput) {
  const owedToUs = new Map<string, number>()
  for (const i of d.invoices) owedToUs.set(i.customerId, (owedToUs.get(i.customerId) ?? 0) + i.totalBaisa)
  for (const p of d.customerPayments) owedToUs.set(p.customerId!, (owedToUs.get(p.customerId!) ?? 0) - p.amountBaisa)
  const owedByUs = new Map<string, number>()
  for (const p of d.purchases) owedByUs.set(p.supplierId, (owedByUs.get(p.supplierId) ?? 0) + p.totalBaisa)
  for (const p of d.supplierPayments) owedByUs.set(p.supplierId!, (owedByUs.get(p.supplierId!) ?? 0) - p.amountBaisa)
  const positive = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + Math.max(v, 0), 0)
  return { receivableBaisa: positive(owedToUs), payableBaisa: positive(owedByUs) }
}
