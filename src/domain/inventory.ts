import { roundQty } from './quantity'

/** The part of an item that stock movements change. */
export interface StockState {
  qtyOnHand: number
  /** Weighted-average cost per unit, in baisa. May be fractional (e.g. per-gram costs). */
  avgCostBaisa: number
}

const EPS = 1e-9

export class InsufficientStockError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
    public readonly itemName?: string,
  ) {
    super(`Insufficient stock${itemName ? ` for ${itemName}` : ''}: ${available} < ${requested}`)
    this.name = 'InsufficientStockError'
  }
}

/** Keeps per-unit costs to 0.001 baisa so per-gram costs stay meaningful. */
export function roundUnitCost(baisa: number): number {
  return Math.round(baisa * 1000) / 1000
}

/** Stock coming in (purchase, production, positive adjustment): updates the weighted average. */
export function receive(state: StockState, qty: number, unitCostBaisa: number): StockState {
  if (!(qty > 0)) throw new Error('Received quantity must be positive')
  if (unitCostBaisa < 0) throw new Error('Unit cost cannot be negative')
  const oldQty = Math.max(state.qtyOnHand, 0)
  const newQty = roundQty(state.qtyOnHand + qty)
  const avg = (oldQty * state.avgCostBaisa + qty * unitCostBaisa) / (oldQty + qty)
  return { qtyOnHand: newQty, avgCostBaisa: roundUnitCost(avg) }
}

/** Stock going out (sale, consumption, waste): average cost is unchanged. */
export function issue(state: StockState, qty: number, itemName?: string): StockState {
  if (!(qty > 0)) throw new Error('Issued quantity must be positive')
  if (qty > state.qtyOnHand + EPS) throw new InsufficientStockError(state.qtyOnHand, qty, itemName)
  return { qtyOnHand: roundQty(state.qtyOnHand - qty), avgCostBaisa: state.avgCostBaisa }
}

/**
 * Undoes an earlier receipt (e.g. deleting a purchase). Fails if part of that
 * stock has already been used, since removing it would make the balance negative.
 */
export function reverseReceipt(
  state: StockState,
  qty: number,
  unitCostBaisa: number,
  itemName?: string,
): StockState {
  if (qty > state.qtyOnHand + EPS) throw new InsufficientStockError(state.qtyOnHand, qty, itemName)
  const newQty = roundQty(state.qtyOnHand - qty)
  if (newQty <= EPS) return { qtyOnHand: 0, avgCostBaisa: state.avgCostBaisa }
  const avg = (state.qtyOnHand * state.avgCostBaisa - qty * unitCostBaisa) / newQty
  return { qtyOnHand: newQty, avgCostBaisa: roundUnitCost(Math.max(avg, 0)) }
}

export function isLowStock(item: { qtyOnHand: number; minQty: number }): boolean {
  return item.qtyOnHand <= item.minQty
}

/** Current value of stock on hand, rounded to whole baisa. */
export function stockValue(item: StockState): number {
  return Math.round(Math.max(item.qtyOnHand, 0) * item.avgCostBaisa)
}
