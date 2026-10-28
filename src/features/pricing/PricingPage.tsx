import { Check, Calculator } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { Field, FormError, NumberInput, Segmented, Select } from '../../components/form'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { ASSETS_KEY, fetchAssets } from '../../data/assets'
import { serverError } from '../../data/errors'
import { EXPENSES_KEY, fetchExpenses } from '../../data/expenses'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchBatches, PRODUCTION_KEY } from '../../data/production'
import { fetchSales, SALES_KEY, setChannelPrice } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { updateSettings } from '../../data/settings'
import { useQuery } from '../../data/useQuery'
import { breakEvenUnits, currentMonthlyDepreciation, fixedPerUnit } from '../../domain/depreciation'
import { lastFullMonths } from '../../domain/forecast'
import { baisaToInput, formatOMR, normalizeDigits, parseRialToBaisa } from '../../domain/money'
import { averageUnitCost, marginOfPrice, markupFromMargin, priceForMargin, withVat } from '../../domain/pricing'
import { formatQty } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`)
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

/**
 * Price from the real unit cost and a wanted margin: price = cost ÷ (1 − margin).
 * The cost can include each jar's share of the fixed costs (expenses and the
 * depreciation of machines), spread over the jars planned each month.
 * Compares with each channel's current price and can approve the new price for a channel.
 */
export function PricingPage() {
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const batches = useQuery(PRODUCTION_KEY, fetchBatches)
  const sales = useQuery(SALES_KEY, fetchSales)
  const expenses = useQuery(EXPENSES_KEY, fetchExpenses)
  const assets = useQuery(ASSETS_KEY, fetchAssets)
  const settings = useSettingsQuery().data
  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)
  const today = todayIso()
  const past = lastFullMonths(today)

  const [productId, setProductId] = useState('')
  const [basis, setBasis] = useState('avg')
  const [margin, setMargin] = useState('30')
  const [costBase, setCostBase] = useState<'full' | 'variable'>('full')
  const [fixedText, setFixedText] = useState<string | null>(null)
  const [unitsText, setUnitsText] = useState<string | null>(null)
  const [unitsSaved, setUnitsSaved] = useState(false)
  const [approved, setApproved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Suggestions: average expenses and production of the last 3 full months
  const avgExpenses = Math.round(avg(past.map((m) => (expenses.data?.expenses ?? []).filter((e) => e.date.startsWith(m)).reduce((s, e) => s + e.amountBaisa, 0))))
  const avgUnits = Math.round(avg(past.map((m) => (batches.data ?? []).filter((b) => b.productionDate.startsWith(m)).reduce((s, b) => s + b.qtyProduced, 0))))
  const depreciation = currentMonthlyDepreciation(assets.data ?? [], today)
  useEffect(() => {
    if (fixedText == null && expenses.data) setFixedText(baisaToInput(avgExpenses))
  }, [expenses.data, avgExpenses, fixedText])
  useEffect(() => {
    if (unitsText == null && settings && batches.data) setUnitsText(String(settings.plannedMonthlyUnits ?? (avgUnits || '')))
  }, [settings, batches.data, avgUnits, unitsText])

  const fixedExpenses = parseRialToBaisa(fixedText ?? '') ?? 0
  const units = Number(normalizeDigits(unitsText ?? ''))
  const monthlyFixed = fixedExpenses + depreciation
  const fixedShare = fixedPerUnit(monthlyFixed, units)

  const pid = productId || products[0]?.id || ''
  const product = products.find((p) => p.id === pid)
  const mine = (batches.data ?? []).filter((b) => b.productId === pid)
  const variableCost = basis === 'avg' ? averageUnitCost(mine) : (mine.find((b) => b.id === basis)?.unitCostBaisa ?? null)
  const useFull = costBase === 'full' && fixedShare != null
  const cost = variableCost == null ? null : useFull ? variableCost + fixedShare! : variableCost
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
  const saveUnits = async () => {
    setError(null)
    try {
      await updateSettings({ plannedMonthlyUnits: units > 0 ? units : null })
      setUnitsSaved(true)
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
              <Field label={t('تكلفة المواد للعبوة من', 'Materials cost per jar from')}>
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

          {/* Fixed costs spread over each jar */}
          <Card>
            <h2 className="mb-1 text-lg font-bold">{t('التكاليف الثابتة الشهرية', 'Monthly fixed costs')}</h2>
            <p className="mb-4 text-sm text-muted">
              {t(
                'ما يُدفع كل شهر مهما كانت الكمية، يُوزَّع بالتساوي على العبوات المخطط إنتاجها في الشهر.',
                'What is paid every month whatever the quantity, spread evenly over the jars planned each month.',
              )}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('المصروفات الشهرية', 'Monthly expenses')} hint={t(`متوسط آخر 3 أشهر كاملة: ${formatOMR(avgExpenses)}`, `Last 3 full months average: ${formatOMR(avgExpenses)}`)}>
                <NumberInput value={fixedText ?? ''} onChange={(e) => setFixedText(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
              </Field>
              <Field label={t('إهلاك المعدات والتجهيز', 'Equipment depreciation')} hint={<Link to="/assets" className="underline">{t('من صفحة الأصول والمعدات', 'From the assets page')}</Link>}>
                <div className="num flex min-h-12 items-center rounded-xl border border-line bg-ground px-4 font-bold">{formatOMR(depreciation)}</div>
              </Field>
              <Field
                label={t('العبوات المخطط إنتاجها شهرياً', 'Jars planned each month')}
                hint={
                  unitsSaved
                    ? t('حُفظ', 'Saved')
                    : avgUnits
                      ? t(`متوسط إنتاج آخر 3 أشهر: ${formatQty(avgUnits)}`, `Last 3 months average: ${formatQty(avgUnits)}`)
                      : undefined
                }
              >
                <div className="flex gap-2">
                  <NumberInput value={unitsText ?? ''} onChange={(e) => (setUnitsText(e.target.value), setUnitsSaved(false))} />
                  <Button variant="secondary" onClick={saveUnits} disabled={!(units > 0) || units === settings?.plannedMonthlyUnits}>
                    {t('حفظ', 'Save')}
                  </Button>
                </div>
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3">
              <span>
                {t('المجموع الشهري', 'Monthly total')} <b className="num">{formatOMR(monthlyFixed)}</b>
                {fixedShare != null && (
                  <>
                    {' '}
                    — {t('نصيب العبوة', 'per jar')} <b className="num">{formatOMR(Math.round(fixedShare))}</b>
                  </>
                )}
              </span>
              <Segmented<'full' | 'variable'>
                value={costBase}
                onChange={setCostBase}
                options={[
                  { value: 'full', label: t('سعّر على التكلفة الكاملة', 'Price on the full cost') },
                  { value: 'variable', label: t('على المواد فقط', 'On materials only') },
                ]}
              />
            </div>
            {costBase === 'full' && fixedShare == null && (
              <p className="mt-2 text-sm text-amber-800">{t('يُرجى كتابة عدد العبوات الشهري لتوزيع التكاليف الثابتة.', 'Enter the jars per month to spread the fixed costs.')}</p>
            )}
          </Card>

          {cost == null || variableCost == null ? (
            <Card>
              <p className="text-muted">{t('لا توجد دفعات إنتاج لهذا المنتج بعد، فلا تُعرف تكلفته الفعلية.', 'No production batches for this product yet, so its real cost is unknown.')}</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label={useFull ? t('التكلفة الكاملة للعبوة', 'Full cost per jar') : t('تكلفة مواد العبوة', 'Materials cost per jar')}
                  value={formatOMR(Math.round(cost))}
                />
                <Stat label={t('السعر المقترح', 'Suggested price')} value={price != null ? formatOMR(price) : '—'} tone="green" />
                <Stat label={t('الربح في العبوة', 'Profit per unit')} value={price != null ? formatOMR(Math.round(price - cost)) : '—'} />
                <Stat label={settings?.vatRegistered ? t(`مع الضريبة ${vatRate}%`, `With ${vatRate}% VAT`) : t('مع الضريبة (0% حالياً)', 'With VAT (0% now)')} value={price != null ? formatOMR(withVat(price, vatRate)) : '—'} />
              </div>
              {useFull && (
                <p className="text-sm text-muted">
                  {t(
                    `التكلفة الكاملة = مواد ${formatOMR(Math.round(variableCost))} + تكاليف ثابتة ${formatOMR(Math.round(fixedShare!))} للعبوة.`,
                    `Full cost = materials ${formatOMR(Math.round(variableCost))} + fixed costs ${formatOMR(Math.round(fixedShare!))} per jar.`,
                  )}
                </p>
              )}
              {price == null && <FormError message={t('الهامش يجب أن يكون من 0 إلى أقل من 100.', 'The margin must be from 0 to below 100.')} />}

              <Card className="p-0">
                <h2 className="px-5 pt-4 text-lg font-bold">{t('مقارنة بأسعار القنوات', 'Compared with channel prices')}</h2>
                <ul className="mt-2 divide-y divide-line">
                  {channels.map((c) => {
                    const cur = currentPrice(c.id)
                    const curMargin = cur != null ? marginOfPrice(cost, cur) : null
                    const even = cur != null ? breakEvenUnits(monthlyFixed, cur, variableCost) : null
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-sm text-muted">
                            {cur != null
                              ? t(`السعر الحالي ${formatOMR(cur)} · هامشه ${pct(curMargin)}`, `Current ${formatOMR(cur)} · margin ${pct(curMargin)}`)
                              : t('لا يوجد سعر بعد', 'No price yet')}
                          </div>
                          {cur != null && monthlyFixed > 0 && (
                            <div className="text-sm text-muted">
                              {even != null
                                ? t(`نقطة التعادل: بيع ${formatQty(even)} عبوة شهرياً بهذا السعر لتغطية التكاليف الثابتة`, `Break-even: sell ${formatQty(even)} jars a month at this price to cover fixed costs`)
                                : t('هذا السعر لا يغطي حتى تكلفة المواد', 'This price does not even cover the materials')}
                            </div>
                          )}
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
