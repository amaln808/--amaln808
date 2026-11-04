/** One purchase line: what a supplier charged for a unit of an item on a date. */
export interface PriceLine {
  itemId: string
  supplierId: string
  date: string
  /** Breaks ties within a day */
  seq: string
  qty: number
  unitCostBaisa: number
  vatRate: number
}

export interface SupplierPrice {
  supplierId: string
  lastBaisa: number
  lastDate: string
  minBaisa: number
  /** Weighted by quantity bought */
  avgBaisa: number
  purchases: number
  qty: number
}

export interface ItemPrices {
  itemId: string
  /** Cheapest last price first */
  suppliers: SupplierPrice[]
  cheapestId: string
  /** The supplier of the most recent purchase */
  lastSupplierId: string
  /** How much more the most recent purchase cost per unit than the cheapest supplier's last price (0 if it was the cheapest) */
  overpaidPct: number
  /** Change from the first price ever paid to the latest (any supplier) */
  trendPct: number | null
}

/**
 * Compares suppliers' prices for each item. Without VAT registration the VAT
 * paid is part of the cost (it is not reclaimed), so it is included.
 */
export function compareSupplierPrices(lines: PriceLine[], includeVat: boolean): ItemPrices[] {
  const unit = (l: PriceLine) => (includeVat ? l.unitCostBaisa * (1 + l.vatRate / 100) : l.unitCostBaisa)
  const byItem = new Map<string, PriceLine[]>()
  for (const l of lines) if (l.qty > 0) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), l])

  const out: ItemPrices[] = []
  for (const [itemId, rows] of byItem) {
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.seq.localeCompare(b.seq))
    const bySupplier = new Map<string, PriceLine[]>()
    for (const l of rows) bySupplier.set(l.supplierId, [...(bySupplier.get(l.supplierId) ?? []), l])
    const suppliers: SupplierPrice[] = [...bySupplier].map(([supplierId, ls]) => {
      const last = ls[ls.length - 1]
      const qty = ls.reduce((s, l) => s + l.qty, 0)
      return {
        supplierId,
        lastBaisa: round3(unit(last)),
        lastDate: last.date,
        minBaisa: round3(Math.min(...ls.map(unit))),
        avgBaisa: round3(ls.reduce((s, l) => s + unit(l) * l.qty, 0) / qty),
        purchases: ls.length,
        qty: round3(qty),
      }
    })
    suppliers.sort((a, b) => a.lastBaisa - b.lastBaisa || b.lastDate.localeCompare(a.lastDate))
    const latest = rows[rows.length - 1]
    const cheapest = suppliers[0]
    const latestPrice = unit(latest)
    const first = unit(rows[0])
    out.push({
      itemId,
      suppliers,
      cheapestId: cheapest.supplierId,
      lastSupplierId: latest.supplierId,
      overpaidPct: cheapest.lastBaisa ? Math.max(0, Math.round(((latestPrice - cheapest.lastBaisa) / cheapest.lastBaisa) * 100)) : 0,
      trendPct: rows.length > 1 && first ? Math.round(((latestPrice - first) / first) * 100) : null,
    })
  }
  return out
}

const round3 = (v: number) => Math.round(v * 1000) / 1000
