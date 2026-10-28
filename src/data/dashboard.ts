import type { DashboardInput } from '../domain/dashboard'
import { db } from './client'

export const DASHBOARD_KEY = 'dashboard'

/** Everything the dashboard adds up, in the shapes of src/domain/dashboard.ts. */
export async function fetchDashboard() {
  const [inv, lines, cp, sp, pur, exp, bat, items, stock, assets] = await Promise.all([
    db().from('sales_invoices').select('id, customer_id, channel_id, date, subtotal_baisa, discount_baisa, total_baisa').eq('status', 'issued'),
    db().from('invoice_lines').select('invoice_id, product_id, qty, unit_price_baisa, invoice_line_lots(qty, unit_cost_baisa)'),
    db().from('customer_payments').select('customer_id, date, amount_baisa'),
    db().from('supplier_payments').select('supplier_id, date, amount_baisa'),
    db().from('purchases').select('supplier_id, total_baisa'),
    db().from('expenses').select('date, amount_baisa, category_id'),
    db().from('production_batches').select('production_date, qty_produced, total_cost_baisa'),
    db().from('items').select('id, type, active, min_qty'),
    db().from('v_stock').select('item_id, qty, value_baisa'),
    db().from('assets').select('purchase_date, cost_baisa, life_months, residual_baisa').eq('active', true),
  ])
  for (const r of [inv, lines, cp, sp, pur, exp, bat, items, stock, assets]) if (r.error) throw r.error

  const linesBy = new Map<string, DashboardInput['invoices'][number]['lines']>()
  for (const l of lines.data!) {
    const lots = (l.invoice_line_lots as Array<{ qty: number; unit_cost_baisa: number }> | null) ?? []
    const qty = Number(l.qty)
    const cost = lots.reduce((s, x) => s + Number(x.qty) * Number(x.unit_cost_baisa), 0)
    const row = { itemId: l.product_id as string, qty, unitPriceBaisa: Number(l.unit_price_baisa), unitCostBaisa: qty ? cost / qty : 0 }
    linesBy.set(l.invoice_id as string, [...(linesBy.get(l.invoice_id as string) ?? []), row])
  }
  const stockBy = new Map(stock.data!.map((s) => [s.item_id as string, { qty: Number(s.qty), value: Number(s.value_baisa) }]))

  const input: DashboardInput = {
    invoices: inv.data!.map((i) => ({
      id: i.id as string,
      customerId: i.customer_id as string,
      channelId: i.channel_id as string | null,
      date: i.date as string,
      subtotalBaisa: Number(i.subtotal_baisa),
      discountBaisa: Number(i.discount_baisa),
      totalBaisa: Number(i.total_baisa),
      lines: linesBy.get(i.id as string) ?? [],
    })),
    customerPayments: cp.data!.map((p) => ({ customerId: p.customer_id as string, date: p.date as string, amountBaisa: Number(p.amount_baisa) })),
    supplierPayments: sp.data!.map((p) => ({ supplierId: p.supplier_id as string, date: p.date as string, amountBaisa: Number(p.amount_baisa) })),
    purchases: pur.data!.map((p) => ({ supplierId: p.supplier_id as string, totalBaisa: Number(p.total_baisa) })),
    expenses: exp.data!.map((e) => ({ date: e.date as string, amountBaisa: Number(e.amount_baisa), categoryId: e.category_id as string })),
    batches: bat.data!.map((b) => ({ date: b.production_date as string, qtyProduced: Number(b.qty_produced), totalCostBaisa: Number(b.total_cost_baisa) })),
    items: items.data!.map((i) => {
      const s = stockBy.get(i.id as string) ?? { qty: 0, value: 0 }
      return {
        id: i.id as string,
        type: i.type as 'raw' | 'packaging' | 'finished',
        active: i.active as boolean,
        qtyOnHand: s.qty,
        minQty: Number(i.min_qty),
        avgCostBaisa: s.qty ? s.value / s.qty : 0,
      }
    }),
    assets: assets.data!.map((a) => ({
      purchaseDate: a.purchase_date as string,
      costBaisa: Number(a.cost_baisa),
      lifeMonths: Number(a.life_months),
      residualBaisa: Number(a.residual_baisa),
    })),
  }
  return input
}
