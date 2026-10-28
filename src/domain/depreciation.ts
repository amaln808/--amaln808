import type { DateRange } from './periods'

/**
 * Straight-line depreciation. An asset costs (cost − residual) ÷ life each month,
 * starting the month it was bought, for `lifeMonths` months. It is a fixed cost
 * in profit and pricing, never cash going out (that was paid on purchase).
 */
export interface AssetLike {
  purchaseDate: string
  costBaisa: number
  lifeMonths: number
  residualBaisa: number
}

const monthIndex = (iso: string) => {
  const [y, m] = iso.split('-').map(Number)
  return y * 12 + (m - 1)
}

export function monthlyDepreciation(a: AssetLike): number {
  return (a.costBaisa - a.residualBaisa) / a.lifeMonths
}

/** Months of the asset's life that fall in the range (a month counts when any of its days is in it). */
function monthsIn(a: AssetLike, r: DateRange): number {
  const start = monthIndex(a.purchaseDate)
  const end = start + a.lifeMonths - 1
  const from = Math.max(start, monthIndex(r.from))
  const to = Math.min(end, monthIndex(r.to))
  return Math.max(0, to - from + 1)
}

/** Depreciation charged in a period, whole baisa. */
export function depreciationIn(assets: AssetLike[], r: DateRange): number {
  return Math.round(assets.reduce((s, a) => s + monthlyDepreciation(a) * monthsIn(a, r), 0))
}

/** Depreciation per month for the assets still being depreciated in the month of `today`. */
export function currentMonthlyDepreciation(assets: AssetLike[], today: string): number {
  return depreciationIn(assets, { from: today, to: today })
}

/** Charged so far (up to and including this month) and what is left on the books. */
export function bookValue(a: AssetLike, today: string) {
  const done = monthsIn(a, { from: a.purchaseDate, to: today })
  const accumulated = Math.round(monthlyDepreciation(a) * done)
  return { monthsDone: done, accumulatedBaisa: accumulated, bookValueBaisa: a.costBaisa - accumulated, finished: done >= a.lifeMonths }
}

/**
 * Getting the money put into the project back. «Recovered» is what the factory
 * has earned so far before depreciation (revenue − goods sold − expenses since
 * the start); the months left use the average of the last full months.
 */
export function payback(investedBaisa: number, earnedSoFarBaisa: number, monthlyEarnings: number[]) {
  const recovered = Math.max(0, Math.min(investedBaisa, earnedSoFarBaisa))
  const left = investedBaisa - recovered
  const avg = monthlyEarnings.length ? monthlyEarnings.reduce((s, x) => s + x, 0) / monthlyEarnings.length : 0
  return {
    recoveredBaisa: recovered,
    leftBaisa: left,
    share: investedBaisa ? recovered / investedBaisa : 0,
    /** null when the recent months earn nothing (no estimate possible) */
    monthsLeft: left === 0 ? 0 : avg > 0 ? Math.ceil(left / avg) : null,
  }
}

/** Fixed cost carried by each unit, and the units to sell each month to cover it at a price. */
export function fixedPerUnit(monthlyFixedBaisa: number, unitsPerMonth: number): number | null {
  return unitsPerMonth > 0 ? monthlyFixedBaisa / unitsPerMonth : null
}
export function breakEvenUnits(monthlyFixedBaisa: number, priceBaisa: number, variableCostBaisa: number): number | null {
  const margin = priceBaisa - variableCostBaisa
  return margin > 0 ? Math.ceil(monthlyFixedBaisa / margin) : null
}
