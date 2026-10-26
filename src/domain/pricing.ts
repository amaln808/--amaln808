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
