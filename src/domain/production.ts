import { roundUnitCost } from './inventory'
import { lineTotal } from './money'
import { roundQty } from './quantity'

export interface Component {
  itemId: string
  qtyPerUnit: number
}

export interface ConsumptionLine {
  itemId: string
  qty: number
}

export interface CostedLine extends ConsumptionLine {
  unitCostBaisa: number
}

/** Recipe quantities scaled to the number of units being produced. */
export function suggestConsumption(components: Component[], unitsProduced: number): ConsumptionLine[] {
  return components.map((c) => ({ itemId: c.itemId, qty: roundQty(c.qtyPerUnit * unitsProduced) }))
}

/** Merges repeated items and drops empty lines. */
export function mergeConsumption(lines: ConsumptionLine[]): ConsumptionLine[] {
  const byItem = new Map<string, number>()
  for (const l of lines) {
    if (!l.itemId || !(l.qty > 0)) continue
    byItem.set(l.itemId, roundQty((byItem.get(l.itemId) ?? 0) + l.qty))
  }
  return [...byItem].map(([itemId, qty]) => ({ itemId, qty }))
}

export interface Shortage {
  itemId: string
  available: number
  required: number
}

export function findShortages(
  lines: ConsumptionLine[],
  stock: Map<string, number>,
): Shortage[] {
  return mergeConsumption(lines)
    .map((l) => ({ itemId: l.itemId, available: stock.get(l.itemId) ?? 0, required: l.qty }))
    .filter((s) => s.required > s.available + 1e-9)
}

export interface BatchCost {
  materialsCostBaisa: number
  extraCostBaisa: number
  totalCostBaisa: number
  /** Per finished unit; may be fractional (0.001 baisa precision) */
  unitCostBaisa: number
}

/** Unit cost = (materials consumed + direct extra costs) ÷ units produced. Salaries are not included. */
export function computeBatchCost(consumed: CostedLine[], extraCostBaisa: number, unitsProduced: number): BatchCost {
  if (!(unitsProduced > 0)) throw new Error('Units produced must be positive')
  const materialsCostBaisa = consumed.reduce((s, l) => s + lineTotal(l.qty, l.unitCostBaisa), 0)
  const totalCostBaisa = materialsCostBaisa + Math.round(extraCostBaisa)
  return {
    materialsCostBaisa,
    extraCostBaisa: Math.round(extraCostBaisa),
    totalCostBaisa,
    unitCostBaisa: roundUnitCost(totalCostBaisa / unitsProduced),
  }
}

/** Estimated material cost of one unit at current average costs. */
export function recipeUnitCost(components: Component[], avgCost: Map<string, number>): number {
  return roundUnitCost(components.reduce((s, c) => s + c.qtyPerUnit * (avgCost.get(c.itemId) ?? 0), 0))
}

export function formatBatchNo(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(4, '0')}`
}
