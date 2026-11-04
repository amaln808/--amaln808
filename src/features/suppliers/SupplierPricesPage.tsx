import { Scale } from 'lucide-react'
import { useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { FormError, TextInput } from '../../components/form'
import { Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, fetchPurchasePrices, fetchSuppliers, INVENTORY_KEY, SUPPLIERS_KEY } from '../../data/inventory'
import { useQuery } from '../../data/useQuery'
import { compareSupplierPrices } from '../../domain/supplierPrices'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { PRICES_KEY, SupplierPricesCard } from './SupplierPricesCard'

/** For every material bought: what each supplier charged, who is cheapest, and where the latest purchase cost more. */
export function SupplierPricesPage() {
  const lines = useQuery(PRICES_KEY, fetchPurchasePrices)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const settings = useSettingsQuery().data
  const [search, setSearch] = useState('')

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]))
  const supplierName = (id: string) => (suppliers.data ?? []).find((s) => s.id === id)?.name ?? '—'
  const all = compareSupplierPrices(lines.data ?? [], !settings?.vatRegistered)
  const q = nameKey(search)
  const list = all
    .filter((p) => !q || nameKey(nameOf(itemById.get(p.itemId))).includes(q))
    // Overpaid first, then materials with several suppliers, then by name
    .sort((a, b) => b.overpaidPct - a.overpaidPct || b.suppliers.length - a.suppliers.length || nameOf(itemById.get(a.itemId)).localeCompare(nameOf(itemById.get(b.itemId)), 'ar'))
  const several = all.filter((p) => p.suppliers.length > 1).length
  const overpaid = all.filter((p) => p.overpaidPct > 0).length

  return (
    <>
      <PageHeader
        title={t('مقارنة أسعار الموردين', 'Supplier price comparison')}
        subtitle={t(
          'لكل مادة: آخر سعر وأقل سعر ومتوسطه لدى كل مورد للوحدة، والأرخص أولاً. السعر شامل الضريبة المدفوعة لأنها لا تُسترد.',
          'For each material: every supplier’s last, lowest and average unit price, cheapest first. VAT paid is included as it is not reclaimed.',
        )}
        back={{ to: '/suppliers', label: t('الموردون', 'Suppliers') }}
      />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={t('مواد مشتراة', 'Materials bought')} value={all.length} />
          <Stat label={t('لها أكثر من مورد', 'With several suppliers')} value={several} />
          <Stat label={t('آخر شراء ليس الأرخص', 'Latest buy not the cheapest')} value={overpaid} tone={overpaid ? 'red' : undefined} />
        </div>
        {lines.error && !lines.data && <FormError message={serverError(lines.error)} />}
        {all.length > 3 && (
          <div className="max-w-sm">
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث عن مادة…', 'Search a material…')} />
          </div>
        )}
        {!list.length ? (
          <Card>
            <EmptyState
              icon={Scale}
              title={lines.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد مشتريات بعد', 'No purchases yet')}
              description={lines.loading ? undefined : t('تظهر المقارنة بعد تسجيل فواتير الشراء.', 'The comparison appears once purchases are recorded.')}
            />
          </Card>
        ) : (
          list.map((p) => <SupplierPricesCard key={p.itemId} prices={p} item={itemById.get(p.itemId)} supplierName={supplierName} />)
        )}
        {all.length > 0 && <p className="text-sm text-muted">{t('السعر للوحدة الأساسية للمادة (كجم، لتر، قطعة…). المقارنة على آخر سعر لكل مورد.', 'Prices are per the material’s base unit. Suppliers are compared on their latest price.')}</p>}
      </div>
    </>
  )
}
