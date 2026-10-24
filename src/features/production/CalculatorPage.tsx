import { Factory } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Field, NumberInput, Select } from '../../components/form'
import { Card, PageHeader, Stat } from '../../components/ui'
import { fetchItemsWithStock, fetchOpenLots, INVENTORY_KEY } from '../../data/inventory'
import { fetchRecipes, PRODUCTION_KEY } from '../../data/production'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { fefoEstimate, planFromRecipe } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { formatQty, parseQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'

/** How much of each material a production run needs, what is on hand, and what it will cost. Touches nothing. */
export function CalculatorPage() {
  const [params] = useSearchParams()
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const lots = useQuery(`${INVENTORY_KEY}:lots`, fetchOpenLots)
  const recipes = useQuery(PRODUCTION_KEY + ':recipes', fetchRecipes)
  const [productId, setProductId] = useState(params.get('product') ?? '')
  const [qty, setQty] = useState('100')
  const today = todayIso()
  const byId = new Map((items.data ?? []).map((i) => [i.id, i]))
  const products = (items.data ?? []).filter((i) => i.active && i.type === 'finished')
  const recipe = recipes.data?.find((r) => r.productId === productId)
  const units = parseQty(qty) ?? 0

  const rows = recipe
    ? planFromRecipe(recipe.components, units).map((p) => ({ ...p, ...fefoEstimate((lots.data ?? []).filter((l) => l.itemId === p.itemId), p.qty, today) }))
    : []
  const cost = Math.round(rows.reduce((s, r) => s + r.cost, 0))
  const shortRows = rows.filter((r) => r.shortage > 0)
  // Largest run possible with what is on hand
  const maxUnits = recipe?.components.length
    ? Math.floor(
        Math.min(
          ...recipe.components.map((c) => fefoEstimate((lots.data ?? []).filter((l) => l.itemId === c.itemId), 0, today).available / c.qtyPerUnit),
        ),
      )
    : 0

  return (
    <>
      <PageHeader title={t('حاسبة المواد', 'Materials calculator')} back={{ to: '/production', label: t('التصنيع', 'Production') }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('المنتج', 'Product')}>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">{t('اختيار المنتج…', 'Choose product…')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('كم عبوة؟', 'How many units?')}>
              <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={t('عبوة', 'units')} />
            </Field>
          </div>
        </Card>

        {productId && !recipe && <p className="text-muted">{t('لا توجد وصفة لهذا المنتج بعد.', 'This product has no recipe yet.')}</p>}

        {recipe && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label={t('تكلفة المواد', 'Material cost')} value={formatOMR(cost)} />
              <Stat label={t('للعبوة', 'Per unit')} value={units ? formatOMR(Math.round(cost / units)) : '—'} />
              <Stat label={t('أقصى كمية ممكنة الآن', 'Most you can make now')} value={t(`${maxUnits} عبوة`, `${maxUnits} units`)} tone={maxUnits >= units ? 'green' : 'red'} />
            </div>
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const item = byId.get(r.itemId)
                  return (
                    <li key={r.itemId} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${r.shortage > 0 ? 'bg-red-50' : ''}`}>
                      <span className="min-w-0 flex-1 font-medium">{nameOf(item)}</span>
                      <span className="num">{t('المطلوب', 'Need')} {formatQty(r.qty, item?.unit)}</span>
                      <span className="num text-muted">{t('المتوفر', 'Have')} {formatQty(r.available, item?.unit)}</span>
                      {r.shortage > 0 ? (
                        <span className="num font-bold text-red-700">{t('ناقص', 'Short')} {formatQty(r.shortage, item?.unit)}</span>
                      ) : (
                        <span className="text-palm">✓</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
            {shortRows.length === 0 && units > 0 && (
              <Link to={`/production/new?product=${productId}&qty=${units}`} className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-brand-700 px-5 font-medium text-on-brand">
                <Factory className="size-5" />
                {t('بدء دفعة بهذه الكمية', 'Start a batch with this quantity')}
              </Link>
            )}
          </>
        )}
      </div>
    </>
  )
}
