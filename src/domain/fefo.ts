/**
 * The same "nearest expiry first" rule the database uses, for previews in the app
 * (production cost estimate, materials calculator). The database stays the judge.
 */
export interface LotLike {
  qtyRemaining: number
  unitCostBaisa: number
  expiryDate: string | null
  receivedDate: string
  qcStatus?: string
}

/** Lots that can be used on `date`: not empty, not expired (and released, if asked). */
export function usableLots<T extends LotLike>(lots: T[], date: string, sellableOnly = false): T[] {
  return lots
    .filter((l) => l.qtyRemaining > 0 && (!l.expiryDate || l.expiryDate >= date) && (!sellableOnly || l.qcStatus === 'passed'))
    .sort(
      (a, b) =>
        (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31') || a.receivedDate.localeCompare(b.receivedDate),
    )
}

export interface FefoEstimate {
  /** Cost of what can be taken, in baisa (not rounded) */
  cost: number
  available: number
  shortage: number
}

export function fefoEstimate(lots: LotLike[], qty: number, date: string): FefoEstimate {
  let need = qty
  let cost = 0
  let available = 0
  for (const l of usableLots(lots, date)) {
    available += l.qtyRemaining
    if (need > 0) {
      const take = Math.min(need, l.qtyRemaining)
      cost += take * l.unitCostBaisa
      need -= take
    }
  }
  return { cost, available: round3(available), shortage: round3(Math.max(0, need)) }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export type ExpiryState = 'ok' | 'soon' | 'expired' | 'none'

export function expiryState(expiry: string | null, today: string, alertDays: number): ExpiryState {
  if (!expiry) return 'none'
  if (expiry < today) return 'expired'
  const days = (Date.parse(expiry) - Date.parse(today)) / 86_400_000
  return days <= alertDays ? 'soon' : 'ok'
}

export interface LedgerEntry {
  date: string
  kind: 'purchase' | 'payment'
  ref: string
  /** purchases add to what we owe, payments reduce it */
  amountBaisa: number
  id: string
}

/** Supplier statement with a running balance, oldest first. */
export function statement(entries: LedgerEntry[]): Array<LedgerEntry & { balance: number }> {
  let balance = 0
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'purchase' ? -1 : 1))
    .map((e) => {
      balance += e.kind === 'purchase' ? e.amountBaisa : -e.amountBaisa
      return { ...e, balance }
    })
}

/** Materials a production run needs: the recipe per unit × number of units (3 decimals). */
export function planFromRecipe(components: Array<{ itemId: string; qtyPerUnit: number }>, units: number) {
  return components.map((c) => ({ itemId: c.itemId, qty: round3(c.qtyPerUnit * units) }))
}
