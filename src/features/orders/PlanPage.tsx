import { AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { FormError } from '../../components/form'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, fetchLastPurchasePrices, INVENTORY_KEY } from '../../data/inventory'
import { fetchOrders, ORDERS_KEY } from '../../data/orders'
import { fetchRecipes, PRODUCTION_KEY } from '../../data/production'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { materialPlan, type PlanOrder } from '../../domain/materialPlan'
import { formatOMR } from '../../domain/money'
import { daysUntil } from '../../domain/orders'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

/** «بعد 6 أيام» / «متأخر 2 يوماً» / «اليوم» */
function when(date: string | null, today: string) {
  if (!date) return { text: t('بلا تاريخ', 'No date'), late: false }
  const d = daysUntil(date, today)
  if (d < 0) return { text: t(`${formatDate(date)} — فات بـ ${-d} يوماً`, `${formatDate(date)} — ${-d} days ago`), late: true }
  if (d === 0) return { text: t(`${formatDate(date)} — اليوم`, `${formatDate(date)} — today`), late: true }
  return { text: t(`${formatDate(date)} — بعد ${d} يوماً`, `${formatDate(date)} — in ${d} days`), late: d <= 3 }
}

/**
 * What to buy for the open orders: the jars still to make (after the stock ready
 * for sale), turned into materials through the recipes and set against the
 * usable stock — what is short, by when, and roughly what it costs.
 */
export function PlanPage() {
  const navigate = useNavigate()
  const orders = useQuery(ORDERS_KEY, fetchOrders)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const recipes = useQuery(`${PRODUCTION_KEY}:recipes`, fetchRecipes)
  const prices = useQuery(`${INVENTORY_KEY}:last-prices`, fetchLastPurchasePrices)
  const today = todayIso()
  const error = orders.error ?? items.error ?? recipes.error

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]))
  // Open orders not produced yet, with a product and a quantity
  const pending: PlanOrder[] = (orders.data ?? [])
    .filter((o) => o.status === 'open' && o.productId && o.qty)
    .filter((o) => {
      const prod = o.steps.find((s) => s.kind === 'production')
      return !prod || (!prod.doneDate && !prod.batchId)
    })
    .map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      productId: o.productId!,
      qty: o.qty!,
      needDate: o.steps.find((s) => s.kind === 'production')?.plannedDate ?? o.dueDate,
    }))
  const ready = new Map((items.data ?? []).filter((i) => i.type === 'finished').map((i) => [i.id, i.stock.sellableQty]))
  const stock = new Map((items.data ?? []).filter((i) => i.type !== 'finished').map((i) => [i.id, i.stock.usableQty]))
  // Cost of a unit: the last price paid (VAT included: it is not reclaimed), else the stock's average
  const unitCost = new Map(
    (items.data ?? []).map((i) => {
      const last = prices.data?.get(i.id)
      const cost = last ? last.unitCostBaisa * (1 + last.vatRate / 100) : i.stock.qty ? i.stock.valueBaisa / i.stock.qty : undefined
      return [i.id, cost] as [string, number | undefined]
    }).filter((x): x is [string, number] => x[1] != null),
  )
  const plan = materialPlan(pending, (recipes.data ?? []).map((r) => ({ productId: r.productId, components: r.components })), ready, stock, unitCost)
  const short = plan.materials.filter((m) => m.shortQty > 0)
  const toMake = plan.production.reduce((s, p) => s + p.toMakeQty, 0)
  const buyUrl = `/purchases/new?items=${short.map((m) => `${m.itemId}:${Math.ceil(m.shortQty * 1000) / 1000}`).join(',')}`
  const loading = orders.loading || items.loading || recipes.loading

  return (
    <>
      <PageHeader
        title={t('خطة شراء المواد', 'Material purchase plan')}
        subtitle={t(
          'من الطلبيات الجارية التي لم تُصنَّع بعد: العبوات المطلوب تصنيعها بعد خصم الجاهز للبيع، ثم المواد اللازمة لها حسب الوصفات مقارنة بالمخزون.',
          'From open orders not produced yet: jars to make after the stock ready for sale, then the materials they need by recipe against the stock.',
        )}
        back={{ to: '/orders', label: t('الطلبيات', 'Orders') }}
        actions={
          short.length > 0 && (
            <Button onClick={() => navigate(buyUrl)}>
              <ShoppingCart className="size-5" />
              {t('فاتورة شراء بالمواد الناقصة', 'Purchase the missing materials')}
            </Button>
          )
        }
      />
      {error && <FormError message={serverError(error)} />}
      {!pending.length ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title={loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد طلبيات تنتظر التصنيع', 'No orders waiting for production')}
            description={
              loading
                ? undefined
                : t('تظهر الخطة عندما تكون هناك طلبية جارية فيها منتج وكمية، ولم تُسجَّل دفعة إنتاجها بعد.', 'The plan shows once an open order with a product and quantity has no production batch yet.')
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('طلبيات تنتظر التصنيع', 'Orders to produce')} value={String(pending.length)} />
            <Stat label={t('عبوات يجب تصنيعها', 'Jars to make')} value={formatQty(toMake)} />
            <Stat label={t('مواد ناقصة', 'Materials short')} value={String(short.length)} tone={short.length ? 'red' : 'green'} />
            <Stat label={t('تكلفة الشراء التقديرية', 'Estimated purchase cost')} value={formatOMR(plan.shortCostBaisa)} />
          </div>

          <Card className="p-0">
            <h2 className="px-5 pt-4 text-lg font-bold">{t('التصنيع المطلوب', 'Production needed')}</h2>
            <ul className="mt-2 divide-y divide-line">
              {plan.production.map((p) => {
                const w = when(p.needDate, today)
                return (
                  <li key={p.productId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="font-bold">{nameOf(itemById.get(p.productId))}</span>
                      <span className="block text-sm text-muted">
                        {t(`الطلبيات: ${p.orders.join('، ')}`, `Orders: ${p.orders.join(', ')}`)}
                      </span>
                      {p.noRecipe && (
                        <Link to={`/products/${p.productId}`} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-red-700 underline">
                          <AlertTriangle className="size-4" />
                          {t('لا توجد وصفة لهذا المنتج — لا تُحسب مواده', 'No recipe — its materials are not counted')}
                        </Link>
                      )}
                    </span>
                    <span className="text-sm text-muted">
                      {t(`مطلوب ${formatQty(p.orderedQty)} · جاهز ${formatQty(p.readyQty)}`, `Ordered ${formatQty(p.orderedQty)} · ready ${formatQty(p.readyQty)}`)}
                    </span>
                    <span className="text-end">
                      <span className="num block font-bold">{t(`يُصنَّع ${formatQty(p.toMakeQty)} عبوة`, `Make ${formatQty(p.toMakeQty)}`)}</span>
                      {p.toMakeQty > 0 && <span className={`text-xs ${w.late ? 'font-bold text-red-700' : 'text-muted'}`}>{w.text}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card className="p-0">
            <h2 className="px-5 pt-4 text-lg font-bold">{t('المواد', 'Materials')}</h2>
            {!plan.materials.length ? (
              <p className="px-5 pb-4 pt-2 text-sm text-muted">{t('المخزون الجاهز يغطي الطلبيات، فلا حاجة لمواد.', 'Ready stock covers the orders; no materials needed.')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {plan.materials.map((m) => {
                  const item = itemById.get(m.itemId)
                  const isShort = m.shortQty > 0
                  const w = when(m.shortBy, today)
                  return (
                    <li key={m.itemId} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${isShort ? '' : 'text-muted'}`}>
                      <span className="min-w-0 flex-1">
                        <Link to={`/inventory/${m.itemId}`} className={`font-bold underline-offset-4 hover:underline ${isShort ? 'text-ink' : ''}`}>
                          {nameOf(item)}
                        </Link>
                        <span className="block text-sm">
                          {t(
                            `اللازم ${formatQty(m.neededQty, item?.unit)} · في المخزون ${formatQty(m.availableQty, item?.unit)}`,
                            `Needed ${formatQty(m.neededQty, item?.unit)} · in stock ${formatQty(m.availableQty, item?.unit)}`,
                          )}
                        </span>
                      </span>
                      {isShort ? (
                        <span className="text-end">
                          <span className="num block font-bold text-red-700">{t(`يُشترى ${formatQty(m.shortQty, item?.unit)}`, `Buy ${formatQty(m.shortQty, item?.unit)}`)}</span>
                          <span className={`text-xs ${w.late ? 'font-bold text-red-700' : 'text-muted'}`}>{t(`قبل ${w.text}`, `By ${w.text}`)}</span>
                          {m.shortCostBaisa != null && <span className="num block text-xs">{t(`≈ ${formatOMR(m.shortCostBaisa)}`, `≈ ${formatOMR(m.shortCostBaisa)}`)}</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-palm">
                          <CheckCircle2 className="size-4" />
                          {t('يكفي', 'Enough')}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <p className="text-sm text-muted">
            {t(
              'تاريخ الحاجة = التاريخ المخطط لمرحلة «التصنيع» في الطلبية، وإن لم يُحدَّد فتاريخ الاستلام. المخزون المحسوب غير منتهي الصلاحية فقط، والتكلفة التقديرية بآخر سعر شراء.',
              'Need date = the order’s planned production date, else its delivery date. Only unexpired stock counts; the cost uses the last purchase price.',
            )}
          </p>
        </div>
      )}
    </>
  )
}
