/**
 * What the open orders still need, worked back to materials (owner's request,
 * 4 Nov 2026). Orders not yet produced are served from the stock ready for sale
 * first (earliest need first); the jars left to make are turned into materials
 * through each product's recipe and set against the usable stock, earliest need
 * first. Pure, so the numbers can be checked by hand.
 */

export interface PlanOrder {
  id: string
  orderNo: string
  productId: string
  qty: number
  /** When production must be done: the production stage date, else the delivery date */
  needDate: string | null
}

export interface PlanRecipe {
  productId: string
  components: Array<{ itemId: string; qtyPerUnit: number }>
}

export interface ProductionNeed {
  productId: string
  orderedQty: number
  readyQty: number
  toMakeQty: number
  needDate: string | null
  orders: string[]
  /** No recipe: its materials cannot be worked out */
  noRecipe: boolean
}

export interface MaterialNeed {
  itemId: string
  neededQty: number
  availableQty: number
  shortQty: number
  /** Date of the first order the stock does not cover */
  shortBy: string | null
  needDate: string | null
  /** Estimated cost of the shortage at the given unit cost */
  shortCostBaisa: number | null
  orders: string[]
}

const round3 = (x: number) => Math.round(x * 1000) / 1000
/** Earliest first, undated last */
const byDate = (a: string | null, b: string | null) => (a ?? '9999') .localeCompare(b ?? '9999')

export function materialPlan(
  orders: PlanOrder[],
  recipes: PlanRecipe[],
  /** Finished jars ready for sale, per product */
  ready: Map<string, number>,
  /** Usable (unexpired) material stock, per item */
  stock: Map<string, number>,
  /** Unit cost per item, for the estimate */
  unitCost: Map<string, number> = new Map(),
) {
  const recipeOf = new Map(recipes.map((r) => [r.productId, r]))
  const sorted = [...orders].filter((o) => o.qty > 0).sort((a, b) => byDate(a.needDate, b.needDate))

  // 1) Jars to make: ready stock serves the earliest orders first
  const left = new Map(ready)
  const production = new Map<string, ProductionNeed>()
  const toMake: Array<{ order: PlanOrder; qty: number }> = []
  for (const o of sorted) {
    const p = production.get(o.productId) ?? { productId: o.productId, orderedQty: 0, readyQty: 0, toMakeQty: 0, needDate: null, orders: [], noRecipe: !recipeOf.has(o.productId) }
    const fromStock = Math.min(o.qty, Math.max(0, left.get(o.productId) ?? 0))
    left.set(o.productId, (left.get(o.productId) ?? 0) - fromStock)
    const make = round3(o.qty - fromStock)
    p.orderedQty = round3(p.orderedQty + o.qty)
    p.readyQty = round3(p.readyQty + fromStock)
    p.toMakeQty = round3(p.toMakeQty + make)
    p.orders.push(o.orderNo)
    if (make > 0) {
      if (!p.needDate || byDate(o.needDate, p.needDate) < 0) p.needDate = o.needDate
      toMake.push({ order: o, qty: make })
    }
    production.set(o.productId, p)
  }

  // 2) Materials: the recipe for each jar to make, set against stock earliest first
  const needs = new Map<string, Array<{ qty: number; date: string | null; orderNo: string }>>()
  for (const { order, qty } of toMake) {
    for (const c of recipeOf.get(order.productId)?.components ?? []) {
      const list = needs.get(c.itemId) ?? []
      list.push({ qty: qty * c.qtyPerUnit, date: order.needDate, orderNo: order.orderNo })
      needs.set(c.itemId, list)
    }
  }
  const materials: MaterialNeed[] = [...needs].map(([itemId, list]) => {
    let available = stock.get(itemId) ?? 0
    let shortBy: string | null = null
    let short = 0
    for (const n of list) {
      const covered = Math.min(n.qty, Math.max(0, available))
      available -= covered
      if (n.qty - covered > 1e-9) {
        if (short === 0) shortBy = n.date
        short += n.qty - covered
      }
    }
    const shortQty = round3(short)
    const cost = unitCost.get(itemId)
    return {
      itemId,
      neededQty: round3(list.reduce((s, n) => s + n.qty, 0)),
      availableQty: round3(stock.get(itemId) ?? 0),
      shortQty,
      shortBy: shortQty > 0 ? shortBy : null,
      needDate: list.map((n) => n.date).sort(byDate)[0] ?? null,
      shortCostBaisa: shortQty > 0 && cost != null ? Math.round(shortQty * cost) : shortQty > 0 ? null : 0,
      orders: [...new Set(list.map((n) => n.orderNo))],
    }
  })
  materials.sort((a, b) => (b.shortQty > 0 ? 1 : 0) - (a.shortQty > 0 ? 1 : 0) || byDate(a.shortBy ?? a.needDate, b.shortBy ?? b.needDate))

  return {
    production: [...production.values()],
    materials,
    shortCostBaisa: materials.reduce((s, m) => s + (m.shortCostBaisa ?? 0), 0),
  }
}
