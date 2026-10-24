import { useMemo } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { fetchItemsWithStock, fetchOpenLots, INVENTORY_KEY, type ItemWithStock, type Lot } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { expiryState } from '../../domain/fefo'

export interface StockAlerts {
  low: ItemWithStock[]
  /** Lots with stock that expire within the alert window */
  expiringLots: Lot[]
  /** Lots with stock already past their expiry date (should be recorded as waste) */
  expiredLots: Lot[]
}

/** Items with their stock, open lots, and the three stock alerts (low, expiring soon, expired). */
export function useStock() {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const lots = useQuery(`${INVENTORY_KEY}:lots`, fetchOpenLots)
  const alertDays = useSettingsQuery().data?.expiryAlertDays ?? 30
  const today = todayIso()

  const alerts = useMemo<StockAlerts>(() => {
    const active = (items.data ?? []).filter((i) => i.active)
    const activeIds = new Set(active.map((i) => i.id))
    const open = (lots.data ?? []).filter((l) => activeIds.has(l.itemId))
    return {
      low: active.filter((i) => i.minQty > 0 && i.stock.usableQty <= i.minQty),
      expiringLots: open.filter((l) => expiryState(l.expiryDate, today, alertDays) === 'soon'),
      expiredLots: open.filter((l) => expiryState(l.expiryDate, today, alertDays) === 'expired'),
    }
  }, [items.data, lots.data, alertDays, today])

  const alertCount = alerts.low.length + alerts.expiringLots.length + alerts.expiredLots.length
  return { items, lots, alerts, alertCount, alertDays, today }
}
