/** Selling price for a wanted margin on the selling price: cost ÷ (1 − margin). */
export function priceForMargin(costBaisa: number, marginPct: number): number | null {
  if (!(marginPct >= 0) || marginPct >= 100 || !(costBaisa >= 0)) return null
  return Math.round(costBaisa / (1 - marginPct / 100))
}

/** The markup on cost that gives the same price («30% margin» = «42.9% markup»). */
export function markupFromMargin(marginPct: number): number | null {
  if (!(marginPct >= 0) || marginPct >= 100) return null
  return (marginPct / (100 - marginPct)) * 100
}

/** Margin a given price leaves on the cost (as % of the price). */
export function marginOfPrice(costBaisa: number, priceBaisa: number): number | null {
  if (!(priceBaisa > 0)) return null
  return ((priceBaisa - costBaisa) / priceBaisa) * 100
}

export function withVat(priceBaisa: number, vatRate: number): number {
  return priceBaisa + Math.round((priceBaisa * vatRate) / 100)
}

/** Average cost per unit over the latest batches, weighted by how many units each made. */
export function averageUnitCost(batches: Array<{ productionDate: string; qtyProduced: number; totalCostBaisa: number }>, last = 3): number | null {
  const recent = [...batches].sort((a, b) => b.productionDate.localeCompare(a.productionDate)).slice(0, last)
  const units = recent.reduce((s, b) => s + b.qtyProduced, 0)
  if (!units) return null
  return recent.reduce((s, b) => s + b.totalCostBaisa, 0) / units
}

export type PriceSource = 'channel' | 'customer' | 'last' | 'cost'

/**
 * The unit price a new sale line starts with, best first: the customer's channel
 * list, the last price this customer paid, the last price anyone paid, then the
 * real unit cost plus a margin. Null when none is known (a product never made).
 */
export function suggestUnitPrice(o: {
  channelPrice?: number | null
  customerLast?: number | null
  anyLast?: number | null
  unitCost?: number | null
  marginPct: number
}): { priceBaisa: number; source: PriceSource } | null {
  if (o.channelPrice != null) return { priceBaisa: o.channelPrice, source: 'channel' }
  if (o.customerLast != null) return { priceBaisa: o.customerLast, source: 'customer' }
  if (o.anyLast != null) return { priceBaisa: o.anyLast, source: 'last' }
  const p = o.unitCost != null ? priceForMargin(o.unitCost, o.marginPct) : null
  return p != null ? { priceBaisa: p, source: 'cost' } : null
}
