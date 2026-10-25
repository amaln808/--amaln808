import { AlertTriangle, Boxes, ChevronLeft, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FormError, Segmented, TextInput } from '../../components/form'
import { Badge, Button, Card, EmptyState, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import type { ItemType, ItemWithStock } from '../../data/inventory'
import { expiryState } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'
import { ItemFormModal } from './ItemFormModal'
import { itemTypeLabel } from './labels'
import { type StockAlerts, useStock } from './useStock'

type Filter = 'all' | Exclude<ItemType, 'finished'>

function AlertsCard({ alerts, items }: { alerts: StockAlerts; items: ItemWithStock[] }) {
  const byId = new Map(items.map((i) => [i.id, i]))
  const rows = [
    ...alerts.expiredLots.map((l) => ({
      key: l.id,
      to: `/inventory/${l.itemId}`,
      tone: 'red' as const,
      text: t(
        `${nameOf(byId.get(l.itemId))}: دفعة ${l.lotCode ?? ''} منتهية منذ ${formatDate(l.expiryDate!)} — يُنصح بتسجيلها تالفاً`,
        `${nameOf(byId.get(l.itemId))}: lot ${l.lotCode ?? ''} expired ${formatDate(l.expiryDate!)} — record as waste`,
      ),
    })),
    ...alerts.expiringLots.map((l) => ({
      key: l.id,
      to: `/inventory/${l.itemId}`,
      tone: 'amber' as const,
      text: t(
        `${nameOf(byId.get(l.itemId))}: دفعة ${l.lotCode ?? ''} تنتهي في ${formatDate(l.expiryDate!)}`,
        `${nameOf(byId.get(l.itemId))}: lot ${l.lotCode ?? ''} expires ${formatDate(l.expiryDate!)}`,
      ),
    })),
    ...alerts.low.map((i) => ({
      key: i.id,
      to: `/inventory/${i.id}`,
      tone: 'amber' as const,
      text: t(
        `${nameOf(i)}: الرصيد ${formatQty(i.stock.usableQty, i.unit)} — الحد الأدنى ${formatQty(i.minQty, i.unit)}`,
        `${nameOf(i)}: ${formatQty(i.stock.usableQty, i.unit)} left — minimum ${formatQty(i.minQty, i.unit)}`,
      ),
    })),
  ]
  if (!rows.length) return null
  return (
    <Card className={alerts.expiredLots.length ? 'border-red-300' : 'border-amber-300'}>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
        <AlertTriangle className={`size-5 ${alerts.expiredLots.length ? 'text-red-700' : 'text-amber-800'}`} />
        {t('تنبيهات المخزون', 'Stock alerts')}
      </h2>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to} className="flex min-h-12 items-center gap-3 py-2">
              <span className={`size-2.5 shrink-0 rounded-full ${r.tone === 'red' ? 'bg-red-600' : 'bg-amber-500'}`} />
              <span className="flex-1">{r.text}</span>
              <ChevronLeft className="size-4 text-muted ltr:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function InventoryPage() {
  const { items, alerts, alertDays, today } = useStock()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  // Finished products have their own page («المخزون الجاهز للبيع»)
  const all = (items.data ?? []).filter((i) => i.active && i.type !== 'finished')
  const shown = all
    .filter((i) => filter === 'all' || i.type === filter)
    .filter((i) => !search.trim() || `${i.name} ${i.nameEn ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const value = all.reduce((s, i) => s + i.stock.valueBaisa, 0)
  const inactive = (items.data ?? []).filter((i) => !i.active && i.type !== 'finished')
  const ids = new Set(all.map((i) => i.id))
  const materialAlerts: StockAlerts = {
    low: alerts.low.filter((i) => ids.has(i.id)),
    expiringLots: alerts.expiringLots.filter((l) => ids.has(l.itemId)),
    expiredLots: alerts.expiredLots.filter((l) => ids.has(l.itemId)),
  }

  return (
    <>
      <PageHeader
        title={t('مخزون المواد الخام والتغليف', 'Materials stock')}
        subtitle={t(`قيمة المواد الحالية: ${formatOMR(value)} — المنتجات الجاهزة في «المخزون الجاهز للبيع»`, `Current materials value: ${formatOMR(value)} — finished products are in «Ready for sale»`)}
        actions={
          <>
            <Link to="/suppliers" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-4">
              {t('الموردون والمشتريات', 'Suppliers & purchases')}
            </Link>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-5" />
              {t('صنف جديد', 'New item')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <AlertsCard alerts={materialAlerts} items={all} />

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="md:w-[22rem]">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('الكل', 'All') },
                { value: 'raw', label: t('خام', 'Raw') },
                { value: 'packaging', label: t('تغليف', 'Packaging') },
              ]}
            />
          </div>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-muted" />
            <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('بحث', 'Search')} className="ps-10" />
          </div>
        </div>

        {items.error && !items.data && <FormError message={serverError(items.error)} />}

        <Card className="p-0">
          {!shown.length ? (
            <EmptyState
              icon={Boxes}
              title={items.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد أصناف', 'No items')}
              description={t('يمكن تحميل بيانات المصنع الوهمي من الإعدادات للتجربة.', 'You can load the demo factory from Settings to try things out.')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((i) => {
                const exp = expiryState(i.stock.nearestExpiry, today, alertDays)
                const low = i.minQty > 0 && i.stock.usableQty <= i.minQty
                return (
                  <li key={i.id}>
                    <Link to={`/inventory/${i.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-brand-50">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{nameOf(i)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <span>{itemTypeLabel(i.type)}</span>
                          {low && <Badge tone="amber">{t('منخفض', 'Low')}</Badge>}
                          {i.stock.expiredQty > 0 && <Badge tone="red">{t(`منتهٍ ${formatQty(i.stock.expiredQty)}`, `Expired ${formatQty(i.stock.expiredQty)}`)}</Badge>}
                          {exp === 'soon' && <Badge tone="amber">{t(`ينتهي ${formatDate(i.stock.nearestExpiry!)}`, `Expires ${formatDate(i.stock.nearestExpiry!)}`)}</Badge>}
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="num font-bold">{formatQty(i.stock.usableQty, i.unit)}</div>
                        <div className="num text-sm text-muted">{formatOMR(i.stock.valueBaisa)}</div>
                      </div>
                      <ChevronLeft className="size-5 text-muted ltr:rotate-180" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {inactive.length > 0 && (
          <details className="text-sm text-muted">
            <summary className="min-h-11 cursor-pointer py-2">{t(`أصناف موقوفة (${inactive.length})`, `Inactive items (${inactive.length})`)}</summary>
            <ul className="flex flex-col gap-1 ps-4">
              {inactive.map((i) => (
                <li key={i.id}>
                  <Link to={`/inventory/${i.id}`} className="underline">
                    {nameOf(i)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {adding && <ItemFormModal onClose={() => setAdding(false)} />}
    </>
  )
}
