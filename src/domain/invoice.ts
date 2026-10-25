import { lineTotal } from './money'

export interface SaleLineInput {
  qty: number
  unitPriceBaisa: number
  /** VAT % for this line (0 while not VAT-registered) */
  vatRate: number
}

export interface PricedSaleLine extends SaleLineInput {
  grossBaisa: number
  discountBaisa: number
  vatBaisa: number
  /** After discount, with VAT */
  totalBaisa: number
}

export interface PricedSale {
  lines: PricedSaleLine[]
  subtotalBaisa: number
  discountBaisa: number
  vatBaisa: number
  totalBaisa: number
}

/**
 * Same rule as price_sales_lines() in the database: the invoice discount is
 * shared across lines in proportion to their value (the last line takes the
 * rounding), then VAT is charged per line on the amount after discount.
 */
export function priceSale(lines: SaleLineInput[], discountBaisa: number): PricedSale {
  const gross = lines.map((l) => lineTotal(l.qty, l.unitPriceBaisa))
  const subtotalBaisa = gross.reduce((s, g) => s + g, 0)
  const discount = Math.min(Math.max(Math.round(discountBaisa || 0), 0), subtotalBaisa)
  let left = discount
  const priced = lines.map((l, i) => {
    const d = i === lines.length - 1 ? left : subtotalBaisa === 0 ? 0 : Math.round((discount * gross[i]) / subtotalBaisa)
    left -= d
    const vat = Math.round(((gross[i] - d) * l.vatRate) / 100)
    return { ...l, grossBaisa: gross[i], discountBaisa: d, vatBaisa: vat, totalBaisa: gross[i] - d + vat }
  })
  const vatBaisa = priced.reduce((s, l) => s + l.vatBaisa, 0)
  return { lines: priced, subtotalBaisa, discountBaisa: discount, vatBaisa, totalBaisa: subtotalBaisa - discount + vatBaisa }
}
