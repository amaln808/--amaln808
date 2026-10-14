import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Factory, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Segmented } from '../../components/form'
import { formatDate } from '../../components/format'
import { Badge, Button, Card, EmptyState, LinkButton, PageHeader, Stat } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { Item } from '../../db/types'
import { formatOMR } from '../../domain/money'
import { recipeUnitCost } from '../../domain/production'
import { formatQty } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { RecipeFormModal } from './RecipeFormModal'

export function ProductionPage() {
  const [tab, setTab] = useState<'batches' | 'recipes'>('batches')
  const [editing, setEditing] = useState<Item | null>(null)
  const items = useLiveQuery(() => db.items.toArray(), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])
  const batches = useLiveQuery(
    async () =>
      (await db.productionBatches.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.batchNo.localeCompare(a.batchNo)),
    [],
  )

  const itemById = new Map(items?.map((i) => [i.id, i]))
  const products = items?.filter((i) => i.type === 'finished' && i.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')) ?? []
  const materials = items?.filter((i) => i.type !== 'finished' && i.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')) ?? []
  const avgCost = new Map(items?.map((i) => [i.id, i.avgCostBaisa]))

  const month = today().slice(0, 7)
  const thisMonth = batches?.filter((b) => b.date.startsWith(month)) ?? []
  const unitsThisMonth = thisMonth.reduce((s, b) => s + b.qtyProduced, 0)
  const costThisMonth = thisMonth.reduce((s, b) => s + b.totalCostBaisa, 0)
  const hasEstimates = recipes?.some((r) => r.isEstimate)

  return (
    <>
      <PageHeader
        title={ar.nav.production}
        actions={
          <LinkButton to="/production/new">
            <Plus className="size-5" /> دفعة إنتاج جديدة
          </LinkButton>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="عبوات منتجة هذا الشهر" value={unitsThisMonth} />
        <Stat label="متوسط تكلفة العبوة هذا الشهر" value={unitsThisMonth ? formatOMR(Math.round(costThisMonth / unitsThisMonth)) : '—'} />
        <Stat label="عدد الدفعات هذا الشهر" value={thisMonth.length} />
      </div>
      <div className="mb-5 max-w-xs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'batches', label: 'الدفعات' },
            { value: 'recipes', label: 'الوصفات' },
          ]}
        />
      </div>

      {tab === 'batches' && (
        <Card className="!p-0 overflow-hidden">
          {batches && !batches.length && (
            <EmptyState icon={Factory} title="لا توجد دفعات إنتاج بعد" description="سجّل أول دفعة لتُخصم المواد ويُضاف المنتج للمخزون تلقائياً." />
          )}
          <ul>
            {batches?.map((b) => {
              const product = itemById.get(b.finishedItemId)
              return (
                <li key={b.id} className="border-b border-stone-100 last:border-0">
                  <Link to={`/production/${b.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone-50">
                    <div className="flex-1">
                      <div className="font-medium">
                        <span className="num text-stone-500">{b.batchNo}</span> · {product?.name}
                      </div>
                      <div className="text-sm text-stone-500">
                        <span className="num">{formatDate(b.date)}</span> · <span className="num">{formatQty(b.qtyProduced, product?.unit)}</span>
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-stone-500">تكلفة العبوة</div>
                      <div className="num font-bold">{formatOMR(Math.round(b.unitCostBaisa))}</div>
                    </div>
                    <ChevronLeft className="size-5 text-stone-400" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {tab === 'recipes' && (
        <div className="flex flex-col gap-4">
          {hasEstimates && (
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <TriangleAlert className="size-5 shrink-0" />
              <p>بعض الوصفات <b>تقديرية</b> (حوالي 70% تمر و30% فول سوداني). عدّل الكميات عندما تتأكد منها، وستُستخدم في اقتراح الاستهلاك فقط — يمكنك دائماً تعديل الاستهلاك الفعلي في كل دفعة.</p>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {products.map((p) => {
              const recipe = recipes?.find((r) => r.finishedItemId === p.id)
              return (
                <Card key={p.id}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold">{p.name}</h2>
                      {recipe?.isEstimate && <Badge tone="amber">تقديرية</Badge>}
                    </div>
                    <Button variant="secondary" onClick={() => setEditing(p)}>
                      <Pencil className="size-4" /> {recipe ? 'تعديل' : 'إنشاء وصفة'}
                    </Button>
                  </div>
                  {recipe ? (
                    <>
                      <ul className="text-sm">
                        {recipe.components.map((c) => {
                          const m = itemById.get(c.itemId)
                          return (
                            <li key={c.itemId} className="flex justify-between border-b border-stone-100 py-2 last:border-0">
                              <span>{m?.name ?? '—'}</span>
                              <span className="num">{formatQty(c.qtyPerUnit, m?.unit)}</span>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="mt-3 flex justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                        <span>تكلفة المواد للعبوة (تقديرية)</span>
                        <b className="num">{formatOMR(Math.round(recipeUnitCost(recipe.components, avgCost)))}</b>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-stone-500">لا توجد وصفة لهذا المنتج.</p>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {editing && (
        <RecipeFormModal
          open
          onClose={() => setEditing(null)}
          product={editing}
          recipe={recipes?.find((r) => r.finishedItemId === editing.id)}
          materials={materials}
        />
      )}
    </>
  )
}
