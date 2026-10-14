import { useLiveQuery } from 'dexie-react-hooks'
import { Badge, Card, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import type { Item, ItemType } from '../../db/types'
import { formatOMR } from '../../domain/money'
import { formatQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'

const TYPE_ORDER: ItemType[] = ['raw', 'packaging', 'finished']

function isLow(item: Item) {
  return item.qtyOnHand <= item.minQty
}

function StockBadge({ item }: { item: Item }) {
  return isLow(item) ? <Badge tone="red">منخفض</Badge> : <Badge tone="green">متوفر</Badge>
}

/** Phase 0: read-only list of seeded items. Purchases and adjustments arrive in phase 1. */
export function InventoryPage() {
  const items = useLiveQuery(
    async () => (await db.items.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )

  return (
    <>
      <PageHeader title={ar.nav.inventory} />
      <div className="flex flex-col gap-5">
        {TYPE_ORDER.map((type) => {
          const group = items?.filter((i) => i.type === type) ?? []
          return (
            <Card key={type}>
              <h2 className="mb-3 text-lg font-bold">{ar.itemTypes[type]}</h2>

              {/* iPad / desktop: table */}
              <table className="hidden w-full text-start sm:table">
                <thead className="text-sm text-stone-500">
                  <tr className="border-b border-stone-200">
                    <th className="py-2 pe-4 text-start font-medium">الصنف</th>
                    <th className="py-2 pe-4 text-start font-medium">الرصيد</th>
                    <th className="py-2 pe-4 text-start font-medium">الحد الأدنى</th>
                    <th className="py-2 pe-4 text-start font-medium">متوسط التكلفة</th>
                    <th className="py-2 pe-4 text-start font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((it) => (
                    <tr key={it.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-3 pe-4">{it.name}</td>
                      <td className="py-3 pe-4"><span className="num">{formatQty(it.qtyOnHand, it.unit)}</span></td>
                      <td className="py-3 pe-4"><span className="num">{formatQty(it.minQty, it.unit)}</span></td>
                      <td className="py-3 pe-4"><span className="num">{formatOMR(it.avgCostBaisa)}</span></td>
                      <td className="py-3 pe-4"><StockBadge item={it} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phone: cards */}
              <ul className="flex flex-col gap-2 sm:hidden">
                {group.map((it) => (
                  <li key={it.id} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{it.name}</span>
                      <StockBadge item={it} />
                    </div>
                    <div className="mt-1 text-sm text-stone-500">
                      الرصيد: <span className="num">{formatQty(it.qtyOnHand, it.unit)}</span> · الحد الأدنى:{' '}
                      <span className="num">{formatQty(it.minQty, it.unit)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </>
  )
}
