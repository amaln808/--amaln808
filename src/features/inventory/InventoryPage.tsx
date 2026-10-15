import { nameOf, t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Segmented } from '../../components/form'
import { Badge, Button, Card, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import type { Item, ItemType } from '../../db/types'
import { isLowStock, stockValue } from '../../domain/inventory'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { ItemFormModal } from './ItemFormModal'

const TYPE_ORDER: ItemType[] = ['raw', 'packaging', 'finished']

export function StockBadge({ item }: { item: Item }) {
  if (!item.active) return <Badge>{t("موقوف", "Inactive")}</Badge>
  return isLowStock(item) ? <Badge tone="red">{t("منخفض", "Low")}</Badge> : <Badge tone="green">{t("متوفر", "In stock")}</Badge>
}

export function useItems() {
  return useLiveQuery(
    async () => (await db.items.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
}

export function InventoryPage() {
  const items = useItems()
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [creating, setCreating] = useState(false)

  const active = items?.filter((i) => i.active) ?? []
  const lowCount = active.filter(isLowStock).length
  const totalValue = active.reduce((s, i) => s + stockValue(i), 0)
  const visible = items?.filter((i) => filter === 'all' || (i.active && isLowStock(i))) ?? []

  return (
    <>
      <PageHeader
        title={ar.nav.inventory}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-5" /> {t("صنف جديد", "New item")}
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Stat label={t("قيمة المخزون", "Stock value")} value={formatOMR(totalValue)} />
        <Stat label={t("أصناف منخفضة", "Low items")} value={lowCount} tone={lowCount ? 'red' : 'green'} />
      </div>
      <div className="mb-5 max-w-xs">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t("الكل", "All") },
            { value: 'low', label: t(`المنخفضة (${lowCount})`, `Low (${lowCount})`) },
          ]}
        />
      </div>

      <div className="flex flex-col gap-5">
        {TYPE_ORDER.map((type) => {
          const group = visible.filter((i) => i.type === type)
          if (!group.length) return null
          return (
            <Card key={type} className="!p-0 overflow-hidden">
              <h2 className="px-5 pt-4 pb-2 text-lg font-bold">{ar.itemTypes[type]}</h2>

              {/* iPad / desktop: table */}
              <table className="hidden w-full sm:table">
                <thead className="text-sm text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th className="px-5 py-2 text-start font-medium">{t("الصنف", "Item")}</th>
                    <th className="py-2 pe-4 text-start font-medium">{t("الرصيد", "Balance")}</th>
                    <th className="py-2 pe-4 text-start font-medium">{t("الحد الأدنى", "Minimum")}</th>
                    <th className="py-2 pe-4 text-start font-medium">{t("متوسط التكلفة", "Average cost")}</th>
                    <th className="py-2 pe-4 text-start font-medium">{t("الحالة", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((it) => (
                    <tr key={it.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <Link to={`/inventory/${it.id}`} className="font-medium text-brand-800">
                          {nameOf(it)}
                        </Link>
                      </td>
                      <td className="py-3 pe-4"><span className="num">{formatQty(it.qtyOnHand, it.unit)}</span></td>
                      <td className="py-3 pe-4"><span className="num">{formatQty(it.minQty, it.unit)}</span></td>
                      <td className="py-3 pe-4"><span className="num">{formatOMR(Math.round(it.avgCostBaisa))}</span></td>
                      <td className="py-3 pe-4"><StockBadge item={it} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phone: rows */}
              <ul className="sm:hidden">
                {group.map((it) => (
                  <li key={it.id} className="border-t border-stone-100">
                    <Link to={`/inventory/${it.id}`} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{nameOf(it)}</span>
                          <StockBadge item={it} />
                        </div>
                        <div className="mt-1 text-sm text-stone-500">
                          {t("الرصيد:", "Balance:")} <span className="num">{formatQty(it.qtyOnHand, it.unit)}</span> {t("· الحد الأدنى:", "· Minimum:")}{' '}
                          <span className="num">{formatQty(it.minQty, it.unit)}</span>
                        </div>
                      </div>
                      <ChevronLeft className="size-5 text-stone-400 ltr:rotate-180" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
        {items && !visible.length && <p className="text-center text-stone-500">{t("لا توجد أصناف منخفضة 👍", "No low items 👍")}</p>}
      </div>

      <ItemFormModal open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
