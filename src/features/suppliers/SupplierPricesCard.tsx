import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui'
import { useSettingsQuery } from '../../app/settingsContext'
import { fetchPurchasePrices, fetchSuppliers, type Item, INVENTORY_KEY, SUPPLIERS_KEY } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { formatOMR } from '../../domain/money'
import { formatQty, unitLabel } from '../../domain/quantity'
import { compareSupplierPrices, type ItemPrices } from '../../domain/supplierPrices'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

/** One material: each supplier's last, lowest and average price per unit, cheapest first. */
export function SupplierPricesCard({ prices, item, supplierName, showItem = true }: { prices: ItemPrices; item?: Pick<Item, 'name' | 'nameEn' | 'unit'>; supplierName: (id: string) => string; showItem?: boolean }) {
  const per = item ? ` / ${unitLabel(item.unit)}` : ''
  const money = (b: number) => formatOMR(Math.round(b))
  const cheapest = prices.suppliers[0]
  const last = prices.suppliers.find((s) => s.supplierId === prices.lastSupplierId)
  return (
    <div className="rounded-2xl border border-line bg-card">
      {showItem && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
          <Link to={`/inventory/${prices.itemId}`} className="text-lg font-bold underline-offset-4 hover:underline">
            {nameOf(item)}
          </Link>
          <span className="text-sm text-muted">
            {prices.suppliers.length === 1 ? t('مورد واحد', 'One supplier') : t(`${prices.suppliers.length} موردين`, `${prices.suppliers.length} suppliers`)}
            {prices.trendPct != null && prices.trendPct !== 0 && (
              <span className={prices.trendPct > 0 ? 'text-red-700' : 'text-palm'}>
                {' · '}
                {t(`السعر ${prices.trendPct > 0 ? 'ارتفع' : 'انخفض'} ${Math.abs(prices.trendPct)}% منذ أول شراء`, `Price ${prices.trendPct > 0 ? 'up' : 'down'} ${Math.abs(prices.trendPct)}% since the first purchase`)}
              </span>
            )}
          </span>
        </div>
      )}
      {prices.overpaidPct > 0 && last && (
        <p className="mx-5 mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {t(
            `آخر شراء كان من «${supplierName(last.supplierId)}» بسعر أعلى بـ ${prices.overpaidPct}% من آخر سعر لدى «${supplierName(cheapest.supplierId)}».`,
            `The latest purchase from «${supplierName(last.supplierId)}» cost ${prices.overpaidPct}% more than «${supplierName(cheapest.supplierId)}»'s last price.`,
          )}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {prices.suppliers.map((s, i) => (
          <li key={s.supplierId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <span className="min-w-0 flex-1">
              <Link to={`/suppliers/${s.supplierId}`} className="font-medium underline-offset-4 hover:underline">
                {supplierName(s.supplierId)}
              </Link>
              {i === 0 && prices.suppliers.length > 1 && (
                <span className="ms-2">
                  <Badge tone="green">{t('الأرخص', 'Cheapest')}</Badge>
                </span>
              )}
              <span className="block text-sm text-muted">
                {t(
                  `${s.purchases} مرة · ${formatQty(s.qty, item?.unit)} · آخرها ${formatDate(s.lastDate)}`,
                  `${s.purchases}× · ${formatQty(s.qty, item?.unit)} · last ${formatDate(s.lastDate)}`,
                )}
              </span>
            </span>
            <span className="text-end">
              <span className={`num block font-bold ${i === 0 && prices.suppliers.length > 1 ? 'text-palm' : ''}`}>
                {money(s.lastBaisa)}
                <span className="text-xs font-normal text-muted">{per}</span>
              </span>
              <span className="num block text-xs text-muted">
                {t(`الأقل ${money(s.minBaisa)} · المتوسط ${money(s.avgBaisa)}`, `Lowest ${money(s.minBaisa)} · average ${money(s.avgBaisa)}`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const PRICES_KEY = `${INVENTORY_KEY}:supplier-prices`

/** On a material's page: its suppliers' prices, when it has been bought from more than one. */
export function ItemSupplierPrices({ item, itemId }: { item: Pick<Item, 'name' | 'nameEn' | 'unit'>; itemId: string }) {
  const lines = useQuery(PRICES_KEY, fetchPurchasePrices)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const vatRegistered = useSettingsQuery().data?.vatRegistered
  const prices = compareSupplierPrices((lines.data ?? []).filter((l) => l.itemId === itemId), !vatRegistered)[0]
  if (!prices || prices.suppliers.length < 2) return null
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{t('أسعار الموردين', 'Supplier prices')}</h2>
        <Link to="/suppliers/prices" className="text-sm font-medium text-brand-800 underline">
          {t('مقارنة كل المواد', 'Compare all materials')}
        </Link>
      </div>
      <SupplierPricesCard prices={prices} item={item} showItem={false} supplierName={(id) => (suppliers.data ?? []).find((s) => s.id === id)?.name ?? '—'} />
    </div>
  )
}
