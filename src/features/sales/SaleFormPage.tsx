import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { Combobox, DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Badge, Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { fetchBatches, PRODUCTION_KEY } from '../../data/production'
import { createInvoice, fetchPastPrices, fetchQuotationDetail, fetchSales, SALES_KEY, saveQuotation, setChannelPrice } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { priceSale } from '../../domain/invoice'
import { baisaToInput, formatOMR, normalizeDigits, parseRialToBaisa } from '../../domain/money'
import { averageUnitCost, priceForMargin, suggestUnitPrice, type PriceSource } from '../../domain/pricing'
import { formatQty, parseQty } from '../../domain/quantity'
import { DEFAULT_OPTIONS, optionTotals, type PriceOption } from '../../domain/quoteOptions'
import { addDays } from '../../domain/sales'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { permitFor, permitLabel } from '../products/permits'
import { optionLabel } from './priceOptions'
import { formatDate } from '../tasks/labels'
import { useSchedule } from '../tasks/useSchedule'

interface Line {
  key: number
  productId: string
  qty: string
  price: string
  /** The price was filled by the app (so it follows a change of customer) */
  auto: boolean
  /** Where a filled price came from */
  source: PriceSource | null
}
let nextKey = 1
/** Margin on cost for the suggested price (as in the pricing calculator) */
const COST_MARGIN = 30
const sourceLabel = (s: PriceSource | null) =>
  s === 'channel'
    ? t('من أسعار القناة', 'From the channel prices')
    : s === 'customer'
      ? t('آخر سعر لهذا العميل', 'Last price to this customer')
      : s === 'last'
        ? t('آخر سعر بيع لهذا المنتج', 'Last selling price of this product')
        : s === 'cost'
          ? t(`التكلفة الفعلية + هامش ${COST_MARGIN}%`, `Real cost + ${COST_MARGIN}% margin`)
          : undefined
const numText = (n: number | undefined) => (n == null ? '' : String(n))
/** Options as form fields; all four are listed, those saved (or all, for a new set) ticked */
const editable = (saved: PriceOption[], allOn: boolean) =>
  DEFAULT_OPTIONS.map((d) => {
    const o = saved.find((x) => x.key === d.key)
    const pct = (o ?? d).pct
    return { ...(o ?? d), on: allOn || !!o, down: pct < 0, pctText: numText(Math.abs(pct)), nText: numText((o ?? d).n) }
  })
const emptyLine = (): Line => ({ key: nextKey++, productId: '', qty: '', price: '', auto: true, source: null })

/**
 * One form for a new quotation, an edited quotation (draft / sent), and a direct
 * invoice. Prices come from the customer's channel; an invoice also checks
 * the stock ready for sale and the product's sale permit before saving.
 */
export function SaleFormPage({ kind }: { kind: 'quote' | 'invoice' }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const past = useQuery(`${SALES_KEY}:past-prices`, fetchPastPrices)
  const batches = useQuery(PRODUCTION_KEY, fetchBatches)
  const existing = useQuery(id ? `quote:${id}` : 'quote:none', () => (id ? fetchQuotationDetail(id) : Promise.resolve(null)))
  const settings = useSettingsQuery().data
  const schedule = useSchedule()
  const today = todayIso()

  const products = (items.data ?? []).filter((i) => i.type === 'finished' && i.active)
  const productById = new Map(products.map((p) => [p.id, p]))
  const customers = (sales.data?.customers ?? []).filter((c) => c.active)

  const [customerName, setCustomerName] = useState('')
  const [date, setDate] = useState(today)
  const [until, setUntil] = useState('')
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  /** Quotation only: show a price per way of paying (null = one price) */
  const [options, setOptions] = useState<Array<PriceOption & { on: boolean; down: boolean; pctText: string; nText: string }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Editing: fill the form once the quotation and customers are loaded
  useEffect(() => {
    if (loaded || !existing.data || !sales.data) return
    const { quotation: q, lines: ql } = existing.data
    setCustomerName(sales.data.customers.find((c) => c.id === q.customerId)?.name ?? '')
    setDate(q.date)
    setUntil(q.validUntil ?? '')
    setDiscount(q.discountBaisa ? baisaToInput(q.discountBaisa) : '')
    setNotes(q.notes ?? '')
    setLines(ql.map((l) => ({ key: nextKey++, productId: l.productId, qty: String(l.qty), price: baisaToInput(l.unitPriceBaisa), auto: false, source: null })))
    if (q.priceOptions?.length) setOptions(editable(q.priceOptions, true))
    setLoaded(true)
  }, [existing.data, sales.data, loaded])

  const customer = customers.find((c) => nameKey(c.name) === nameKey(customerName))
  const channel = sales.data?.channels.find((c) => c.id === customer?.channelId)
  const unitCost = (productId: string) => averageUnitCost((batches.data ?? []).filter((b) => b.productId === productId))
  const listPrice = (productId: string) => sales.data?.prices.find((x) => x.channelId === customer?.channelId && x.productId === productId)?.priceBaisa
  /** Price a line starts with: the channel list, earlier sales, or cost + 30% */
  const suggest = (productId: string): Pick<Line, 'price' | 'source'> => {
    const s = suggestUnitPrice({
      channelPrice: listPrice(productId),
      customerLast: past.data?.find((x) => x.productId === productId && x.customerId === customer?.id)?.priceBaisa,
      anyLast: past.data?.find((x) => x.productId === productId)?.priceBaisa,
      unitCost: unitCost(productId),
      marginPct: COST_MARGIN,
    })
    return s ? { price: baisaToInput(s.priceBaisa), source: s.source } : { price: '', source: null }
  }

  // Opened from a customer's page: start with that customer
  const fromCustomer = params.get('customer')
  useEffect(() => {
    const c = sales.data?.customers.find((x) => x.id === fromCustomer)
    if (c) setCustomerName((v) => v || c.name)
  }, [sales.data, fromCustomer])

  // A different customer may be on a different channel: refresh prices not typed by hand
  useEffect(() => {
    setLines((ls) => ls.map((l) => (l.auto && l.productId ? { ...l, ...suggest(l.productId) } : l)))
  }, [customer?.id, sales.data, past.data, batches.data])

  const [savedFor, setSavedFor] = useState<string | null>(null)
  const keepPrice = async (productId: string, priceBaisa: number) => {
    if (!channel) return
    try {
      await setChannelPrice(channel.id, productId, priceBaisa)
      setSavedFor(`${channel.id}:${productId}:${priceBaisa}`)
    } catch (e) {
      setError(serverError(e))
    }
  }

  // Price options start from the last quotation that had them (the owner's usual %)
  const lastOptions = sales.data?.quotations.find((x) => x.priceOptions?.length)?.priceOptions
  const startOptions = () => setOptions(editable(lastOptions ?? DEFAULT_OPTIONS, !lastOptions))
  const updateOption = (key: string, patch: Partial<{ on: boolean; down: boolean; pctText: string; nText: string }>) =>
    setOptions((os) => os && os.map((o) => (o.key === key ? { ...o, ...patch } : o)))

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const vatRate = (productId: string) =>
    settings?.vatRegistered ? (productById.get(productId)?.vatRate ?? Number(settings.defaultVatRate)) : 0

  const parsed = lines.map((l) => ({ l, qty: parseQty(l.qty), price: parseRialToBaisa(l.price) }))
  const discountBaisa = discount.trim() ? parseRialToBaisa(discount) : 0
  const valid = parsed.filter((p) => p.l.productId && p.qty && p.price != null)
  const priced = priceSale(
    valid.map((p) => ({ qty: p.qty!, unitPriceBaisa: p.price!, vatRate: vatRate(p.l.productId) })),
    discountBaisa ?? 0,
  )

  // Invoice only: warn about what the server will refuse
  const needByProduct = new Map<string, number>()
  for (const p of valid) needByProduct.set(p.l.productId, (needByProduct.get(p.l.productId) ?? 0) + p.qty!)
  const problems =
    kind === 'invoice'
      ? [...needByProduct].flatMap(([pid, need]) => {
          const prod = productById.get(pid)
          const out: string[] = []
          const permit = permitFor(pid, schedule.data?.agreements ?? [], date)
          if (permit.state === 'missing' || permit.state === 'expired') out.push(`${nameOf(prod)}: ${permitLabel(permit)}`)
          const sellable = prod?.stock.sellableQty ?? 0
          if (need > sellable)
            out.push(
              t(
                `${nameOf(prod)}: المطلوب ${formatQty(need)} والجاهز للبيع ${formatQty(sellable)}`,
                `${nameOf(prod)}: need ${formatQty(need)}, ready for sale ${formatQty(sellable)}`,
              ),
            )
          return out
        })
      : []

  // The options as they will be saved, and each one's prices and total for the preview
  const chosenOptions: PriceOption[] | null = options
    ? options
        .filter((o) => o.on)
        .map((o) => {
          const pct = (o.down ? -1 : 1) * Number(normalizeDigits(o.pctText.trim() || '0'))
          const n = o.key === 'deferred' || o.key === 'bulk' ? Number(normalizeDigits(o.nText.trim())) : undefined
          return n === undefined ? { key: o.key, pct } : { key: o.key, pct, n }
        })
    : null
  const optionRows = (chosenOptions ?? []).map((o) =>
    optionTotals(valid.map((p) => ({ qty: p.qty!, unitPriceBaisa: p.price! })), discountBaisa ?? 0, Number.isFinite(o.pct) ? o.pct : 0),
  )

  const untilDefault = settings ? addDays(date, kind === 'quote' ? settings.quoteValidityDays : settings.invoiceDueDays) : ''

  const save = async () => {
    setError(null)
    if (!customerName.trim()) return setError(t('اسم العميل مطلوب.', 'The customer name is required.'))
    const filled = parsed.filter((p) => p.l.productId || p.l.qty || p.l.price)
    if (!filled.length) return setError(t('يجب إضافة بند واحد على الأقل.', 'Add at least one line.'))
    for (const p of filled) {
      const name = nameOf(productById.get(p.l.productId))
      if (!p.l.productId) return setError(t('اختيار المنتج مطلوب في كل بند.', 'Choose the product on every line.'))
      if (!p.qty) return setError(t(`الكمية غير صحيحة في «${name}».`, `Invalid quantity for «${name}».`))
      if (p.price == null) return setError(t(`السعر مطلوب في «${name}».`, `Price needed for «${name}».`))
    }
    if (discountBaisa == null || discountBaisa < 0) return setError(t('الخصم غير صحيح.', 'Invalid discount.'))
    if (discountBaisa > priced.subtotalBaisa) return setError(t('الخصم أكبر من المجموع.', 'The discount is larger than the subtotal.'))
    for (const o of chosenOptions ?? []) {
      if (!Number.isFinite(o.pct) || o.pct <= -100 || o.pct > 1000) return setError(t(`النسبة غير صحيحة في «${optionLabel(o)}».`, `Invalid % for «${optionLabel(o)}».`))
      if (o.n !== undefined && !(Number.isInteger(o.n) && o.n > 0)) return setError(t(`العدد غير صحيح في «${optionLabel(o)}».`, `Invalid number for «${optionLabel(o)}».`))
    }
    setSaving(true)
    try {
      const draft = {
        customerId: customer?.id ?? null,
        customerName: customerName.trim(),
        date,
        untilDate: until || null,
        discountBaisa,
        notes: notes.trim() || null,
        lines: filled.map((p) => ({ productId: p.l.productId, qty: p.qty!, unitPriceBaisa: p.price! })),
        priceOptions: kind === 'quote' && chosenOptions?.length ? chosenOptions : null,
      }
      const newId = kind === 'invoice' ? await createInvoice(draft) : await saveQuotation(draft, id)
      navigate(kind === 'invoice' ? `/invoices/${newId}` : `/quotes/${newId}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
      setSaving(false)
    }
  }

  const title = kind === 'invoice' ? t('فاتورة مباشرة', 'Direct invoice') : id ? t('تعديل عرض الأسعار', 'Edit quotation') : t('عرض أسعار جديد', 'New quotation')

  return (
    <>
      <PageHeader title={title} back={{ to: id ? `/quotes/${id}` : `/sales?tab=${kind === 'invoice' ? 'invoices' : 'quotes'}`, label: t('المبيعات', 'Sales') }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={t('العميل', 'Customer')}
              className="sm:col-span-3"
              hint={
                customerName.trim() && !customer
                  ? t('عميل جديد، يُضاف عند الحفظ (تُضاف قناته لاحقاً من صفحته)', 'New customer, added on save (set the channel later on their page)')
                  : customer
                    ? (sales.data?.channels.find((c) => c.id === customer.channelId)?.name ?? t('بلا قناة — يُقترح آخر سعر أو التكلفة + هامش', 'No channel — the last price or cost + margin is suggested'))
                    : undefined
              }
            >
              <Combobox value={customerName} onChange={setCustomerName} options={customers.map((c) => ({ label: c.name, hint: c.phone ?? undefined }))} newLabel={t('جديد', 'New')} />
            </Field>
            <Field label={t('التاريخ', 'Date')}>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field
              label={kind === 'quote' ? t('ساري حتى', 'Valid until') : t('تاريخ الاستحقاق', 'Due date')}
              hint={!until && untilDefault ? t(`تلقائياً ${formatDate(untilDefault)}`, `Default ${formatDate(untilDefault)}`) : undefined}
            >
              <DateInput value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('البنود', 'Lines')}</h2>
          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const prod = productById.get(l.productId)
              const p = parsed[idx]
              const total = p.qty && p.price != null ? Math.round(p.qty * p.price) : 0
              const cost = l.productId ? unitCost(l.productId) : null
              const suggested = cost != null ? priceForMargin(cost, COST_MARGIN) : null
              return (
                <div key={l.key} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <Field label={t('المنتج', 'Product')} className="col-span-2 sm:col-span-1">
                    <Select
                      value={l.productId}
                      onChange={(e) => update(l.key, l.auto || !l.price ? { productId: e.target.value, ...suggest(e.target.value), auto: true } : { productId: e.target.value })}
                    >
                      <option value="">{t('اختيار المنتج…', 'Choose product…')}</option>
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {nameOf(pr)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('الكمية', 'Qty')} hint={prod && kind === 'invoice' ? t(`متاح ${formatQty(prod.stock.sellableQty)}`, `${formatQty(prod.stock.sellableQty)} available`) : undefined}>
                    <NumberInput value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                  </Field>
                  <Field label={t('سعر العبوة', 'Unit price')} hint={l.auto && l.price ? sourceLabel(l.source) : undefined}>
                    <NumberInput value={l.price} onChange={(e) => update(l.key, { price: e.target.value, auto: false, source: null })} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
                  </Field>
                  {l.productId && (
                    <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-brand-50 px-3 py-2 text-sm sm:col-span-4">
                      {cost != null ? (
                        <>
                          <span>
                            {t('تكلفة العبوة', 'Unit cost')} <b className="num">{formatOMR(Math.round(cost))}</b>
                          </span>
                          <span>
                            {t(`السعر المقترح (هامش ${COST_MARGIN}%)`, `Suggested price (${COST_MARGIN}% margin)`)} <b className="num">{formatOMR(suggested!)}</b>
                          </span>
                          {p.price != null && p.price > 0 && (
                            <span className={p.price < cost ? 'font-bold text-red-700' : 'text-muted'}>
                              {p.price < cost
                                ? t('السعر أقل من التكلفة', 'Price is below cost')
                                : t(`ربح العبوة ${formatOMR(Math.round(p.price - cost))} (هامش ${(((p.price - cost) / p.price) * 100).toFixed(0)}%)`, `Profit ${formatOMR(Math.round(p.price - cost))} per unit (${(((p.price - cost) / p.price) * 100).toFixed(0)}% margin)`)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">{t('لا توجد دفعة إنتاج لهذا المنتج بعد، فلا تُعرف تكلفته.', 'No production batch for this product yet, so its cost is unknown.')}</span>
                      )}
                      {channel && p.price != null && p.price !== listPrice(l.productId) &&
                        (savedFor === `${channel.id}:${l.productId}:${p.price}` ? (
                          <span className="text-palm">{t(`حُفظ في أسعار ${channel.name}`, `Saved to ${channel.name} prices`)}</span>
                        ) : (
                          <button type="button" className="min-h-11 font-medium text-brand-800 underline" onClick={() => keepPrice(l.productId, p.price!)}>
                            {t(`حفظ ${formatOMR(p.price)} كسعر ثابت لقناة ${channel.name}`, `Keep ${formatOMR(p.price)} as the ${channel.name} price`)}
                          </button>
                        ))}
                    </div>
                  )}
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1">
                    <span className="num font-bold">{formatOMR(total)}</span>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                      className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-700"
                      aria-label={t('حذف البند', 'Remove line')}
                    >
                      <Trash2 className="size-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-5" /> {t('إضافة بند', 'Add line')}
          </Button>
          <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Field label={t('خصم على الإجمالي', 'Discount on the total')}>
                <NumberInput value={discount} onChange={(e) => setDiscount(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
              </Field>
              <Field label={t('ملاحظات تظهر في المستند', 'Notes shown on the document')}>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <dl className="flex flex-col gap-1 self-end">
              <div className="flex justify-between">
                <dt className="text-muted">{t('المجموع', 'Subtotal')}</dt>
                <dd className="num">{formatOMR(priced.subtotalBaisa)}</dd>
              </div>
              {priced.discountBaisa > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t('الخصم', 'Discount')}</dt>
                  <dd className="num">− {formatOMR(priced.discountBaisa)}</dd>
                </div>
              )}
              {settings?.vatRegistered && (
                <div className="flex justify-between">
                  <dt className="text-muted">{t('الضريبة', 'VAT')}</dt>
                  <dd className="num">{formatOMR(priced.vatBaisa)}</dd>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <dt>{t('الإجمالي', 'Total')}</dt>
                <dd className="num">{formatOMR(priced.totalBaisa)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        {kind === 'quote' && (
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="flex-1 text-lg font-bold">{t('خيارات الأسعار حسب طريقة الدفع', 'Prices by payment option')}</h2>
              {options ? (
                <Button variant="ghost" onClick={() => setOptions(null)}>
                  {t('سعر واحد فقط', 'One price only')}
                </Button>
              ) : (
                <Button variant="secondary" onClick={startOptions}>
                  <Plus className="size-5" /> {t('إضافة خيارات الأسعار', 'Add price options')}
                </Button>
              )}
            </div>
            {!options ? (
              <p className="mt-2 text-sm text-muted">
                {t(
                  'يظهر في العرض جدول بسعر كل منتج عند الدفع مقدماً، وعلى دفعات، وبعد 60 يوماً، وللكميات الكبيرة — والعميل يختار.',
                  'The quotation shows each product’s price for paying in advance, in instalments, after 60 days, and for large quantities — the customer chooses.',
                )}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">
                  {t('النسبة تخفيض أو زيادة على سعر العبوة في البنود أعلاه (0% = السعر نفسه).', 'The % is taken off or added to the unit prices above (0% = the same price).')}
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {options.map((o, i) => {
                    const row = o.on ? optionRows[(chosenOptions ?? []).findIndex((x) => x.key === o.key)] : undefined
                    return (
                      <div key={o.key} className={`grid grid-cols-2 items-end gap-3 rounded-xl border p-3 sm:grid-cols-[1.6fr_1.6fr_1fr_1.2fr] ${o.on ? 'border-brand-200' : 'border-line opacity-60'}`}>
                        <label className="col-span-2 flex min-h-11 items-center gap-3 sm:col-span-1">
                          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={o.on} onChange={(e) => updateOption(o.key, { on: e.target.checked })} />
                          <span className="font-medium">{optionLabel({ ...o, n: Number(normalizeDigits(o.nText)) || DEFAULT_OPTIONS[i].n })}</span>
                        </label>
                        <Field label={t('على السعر', 'On the price')}>
                          <div className="flex gap-2">
                            <Select className="!w-28 shrink-0" value={o.down ? 'down' : 'up'} onChange={(e) => updateOption(o.key, { down: e.target.value === 'down' })} disabled={!o.on}>
                              <option value="down">{t('تخفيض', 'Less')}</option>
                              <option value="up">{t('زيادة', 'More')}</option>
                            </Select>
                            <NumberInput value={o.pctText} onChange={(e) => updateOption(o.key, { pctText: e.target.value })} suffix="%" disabled={!o.on} />
                          </div>
                        </Field>
                        {o.key === 'deferred' || o.key === 'bulk' ? (
                          <Field label={o.key === 'deferred' ? t('عدد الأيام', 'Days') : t('أقل كمية', 'Minimum qty')}>
                            <NumberInput value={o.nText} onChange={(e) => updateOption(o.key, { nText: e.target.value })} disabled={!o.on} />
                          </Field>
                        ) : (
                          <div className="hidden sm:block" />
                        )}
                        <div className="col-span-2 text-end sm:col-span-1">
                          {row && valid.length > 0 && (
                            <>
                              <div className="num text-sm text-muted">{row.prices.map((x) => formatOMR(x)).join(' · ')}</div>
                              <div className="num font-bold">{formatOMR(row.totalBaisa)}</div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Card>
        )}

        {problems.length > 0 && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="mb-1 flex items-center gap-2 font-bold">
              <Badge tone="red">{t('لا يمكن إصدار الفاتورة بعد', 'Cannot issue yet')}</Badge>
            </div>
            <ul className="list-inside list-disc">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-1">{t('البيع يحتاج تصريح بيع ساري وكمية جاهزة غير منتهية. يمكن حفظه كعرض أسعار بدلاً من ذلك.', 'Selling needs a valid sale permit and unexpired stock. You can save it as a quotation instead.')}</p>
          </div>
        )}
        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:min-w-48 sm:flex-none" onClick={save} disabled={saving}>
            {saving ? t('جارٍ الحفظ…', 'Saving…') : kind === 'invoice' ? t('إصدار الفاتورة', 'Issue invoice') : t('حفظ العرض', 'Save quotation')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('إلغاء', 'Cancel')}
          </Button>
        </div>
      </div>
    </>
  )
}
