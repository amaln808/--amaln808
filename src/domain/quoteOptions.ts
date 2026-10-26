/** Quotation price options: one quotation shows the price for each way of paying. */
export type OptionKey = 'advance' | 'installments' | 'deferred' | 'bulk'

export interface PriceOption {
  key: OptionKey
  /** % on the quotation's line prices (negative = cheaper) */
  pct: number
  /** Days for «deferred», units for «bulk» */
  n?: number
}

export const OPTION_KEYS: OptionKey[] = ['advance', 'installments', 'deferred', 'bulk']

export const DEFAULT_OPTIONS: PriceOption[] = [
  { key: 'advance', pct: -5 },
  { key: 'installments', pct: 0 },
  { key: 'deferred', pct: 5, n: 60 },
  { key: 'bulk', pct: -10, n: 1000 },
]

/** Same rule as option_price() in SQL: whole baisa. */
export function optionPrice(priceBaisa: number, pct: number): number {
  return Math.round((priceBaisa * (100 + pct)) / 100)
}

/** Each line at the option's price, and the quotation total after its discount (VAT 0% here). */
export function optionTotals(lines: Array<{ qty: number; unitPriceBaisa: number }>, discountBaisa: number, pct: number) {
  const prices = lines.map((l) => optionPrice(l.unitPriceBaisa, pct))
  const subtotal = lines.reduce((s, l, i) => s + Math.round(l.qty * prices[i]), 0)
  return { prices, totalBaisa: subtotal - discountBaisa }
}
