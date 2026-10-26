import { Check, Calculator } from 'lucide-react'
import { useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { Field, FormError, NumberInput, Select } from '../../components/form'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchBatches, PRODUCTION_KEY } from '../../data/production'
import { fetchSales, SALES_KEY, setChannelPrice } from '../../data/sales'
import { useQuery } from '../../data/useQuery'
import { formatOMR, normalizeDigits } from '../../domain/money'
import { averageUnitCost, marginOfPrice, markupFromMargin, priceForMargin, withVat } from '../../domain/pricing'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`)

/**
 * Price from the real unit cost and a wanted margin: price = cost ÷ (1 − margin).
 * Compares with each channel's current price and can approve the new price for a channel.
 */
export function PricingPage() {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const batches = useQuery(PRODUCTION_KEY, fetchBatches)
  const sales = useQuery(SALES_KEY, fetchSales)
  const settings = useSettingsQuery().data
  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)

  const [productId, setProductId] = useState('')
  const [basis, setBasis] = useState('avg')
  const [margin, setMargin] = useState('30')
  const [approved, setApproved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pid = productId || products[0]?.id || ''
  const product = products.find((p) => p.id === pid)
  const mine = (batches.data ?? []).filter((b) => b.productId === pid)
  const cost = basis === 'avg' ? averageUnitCost(mine) : (mine.find((b) => b.id === basis)?.unitCostBaisa ?? null)
  const m = Number(normalizeDigits(margin))
  const price = cost != null ? priceForMargin(cost, m) : null
  const vatRate = settings?.vatRegistered ? (product?.vatRate ?? Number(settings.defaultVatRate)) : 0
  const channels = (sales.data?.channels ?? []).filter((c) => c.active)
  const currentPrice = (channelId: string) => sales.data?.prices.find((p) => p.channelId === channelId && p.productId === pid)?.priceBaisa

  const approve = async (channelId: string) => {
    if (price == null) return
    setError(null)
    try {
      await setChannelPrice(channelId, pid, price)
      setApproved(channelId)
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <>
      <PageHeader title={t('حاسبة التسعير', 'Pricing calculator')} />
      {!products.length ? (
        <Card>
          <EmptyState icon={Calculator} title={items.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد منتجات بعد', 'No products yet')} />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('المنتج', 'Product')}>
                <Select value={pid} onChange={(e) => (setProductId(e.target.value), setBasis('avg'), setApproved(null))}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nameOf(p)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('تكلفة العبوة من', 'Unit cost from')}>
                <Select value={basis} onChange={(e) => (setBasis(e.target.value), setApproved(null))}>
                  <option value="avg">{t('متوسط آخر 3 دفعات', 'Average of the last 3 batches')}</option>
                  {mine.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNo} · {formatDate(b.productionDate)} · {formatOMR(Math.round(b.unitCostBaisa))}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('هامش الربح المطلوب', 'Wanted profit margin')}>
                <NumberInput value={margin} onChange={(e) => (setMargin(e.target.value), setApproved(null))} suffix="%" />
              </Field>
            </div>
            <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-relaxed">
              {t(
                `الهامش يُحسب من سعر البيع وليس من التكلفة: هامش ${m || 0}% يعني أن ${m || 0}% من سعر البيع ربح، وهذا يساوي زيادة ${pct(markupFromMargin(m))} على التكلفة.`,
                `The margin is a share of the selling price, not of the cost: a ${m || 0}% margin equals a ${pct(markupFromMargin(m))} markup on cost.`,
              )}
            </p>
          </Card>

          {cost == null ? (
            <Card>
              <p className="text-muted">{t('لا توجد دفعات إنتاج لهذا المنتج بعد، فلا تُعرف تكلفته الفعلية.', 'No production batches for this product yet, so its real cost is unknown.')}</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('تكلفة العبوة', 'Unit cost')} value={formatOMR(Math.round(cost))} />
                <Stat label={t('السعر المقترح', 'Suggested price')} value={price != null ? formatOMR(price) : '—'} tone="green" />
                <Stat label={t('الربح في العبوة', 'Profit per unit')} value={price != null ? formatOMR(Math.round(price - cost)) : '—'} />
                <Stat label={settings?.vatRegistered ? t(`مع الضريبة ${vatRate}%`, `With ${vatRate}% VAT`) : t('مع الضريبة (0% حالياً)', 'With VAT (0% now)')} value={price != null ? formatOMR(withVat(price, vatRate)) : '—'} />
              </div>
              {price == null && <FormError message={t('الهامش يجب أن يكون من 0 إلى أقل من 100.', 'The margin must be from 0 to below 100.')} />}

              <Card className="p-0">
                <h2 className="px-5 pt-4 text-lg font-bold">{t('مقارنة بأسعار القنوات', 'Compared with channel prices')}</h2>
                <ul className="mt-2 divide-y divide-line">
                  {channels.map((c) => {
                    const cur = currentPrice(c.id)
                    const curMargin = cur != null ? marginOfPrice(cost, cur) : null
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-muted">
                            {cur != null
                              ? t(`السعر الحالي ${formatOMR(cur)} · هامشه ${pct(curMargin)}`, `Current ${formatOMR(cur)} · margin ${pct(curMargin)}`)
                              : t('لا يوجد سعر بعد', 'No price yet')}
                          </div>
                        </div>
                        {curMargin != null && curMargin < 0 && <span className="text-sm font-bold text-red-700">{t('أقل من التكلفة', 'Below cost')}</span>}
                        {approved === c.id ? (
                          <span className="inline-flex items-center gap-1 text-sm text-palm">
                            <Check className="size-4" />
                            {t('اعتُمد', 'Approved')}
                          </span>
                        ) : (
                          <Button variant="secondary" disabled={price == null || price === cur} onClick={() => approve(c.id)}>
                            {t(`اعتماد ${price != null ? formatOMR(price) : ''}`, `Approve ${price != null ? formatOMR(price) : ''}`)}
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <FormError message={error} />
              </Card>
            </>
          )}
        </div>
      )}
    </>
  )
}
