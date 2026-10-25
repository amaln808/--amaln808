import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSettingsQuery } from '../../app/settingsContext'
import { Combobox, DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Badge, Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, INVENTORY_KEY } from '../../data/inventory'
import { createInvoice, fetchQuotationDetail, fetchSales, SALES_KEY, saveQuotation } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { priceSale } from '../../domain/invoice'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { formatQty, parseQty } from '../../domain/quantity'
import { addDays } from '../../domain/sales'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { permitFor, permitLabel } from '../products/permits'
import { formatDate } from '../tasks/labels'
import { useSchedule } from '../tasks/useSchedule'

interface Line {
  key: number
  productId: string
  qty: string
  price: string
  /** The price came from the channel list (so it follows a change of customer) */
  auto: boolean
}
let nextKey = 1
const emptyLine = (): Line => ({ key: nextKey++, productId: '', qty: '', price: '', auto: true })

/**
 * One form for a new quotation, an edited quotation (draft / sent), and a direct
 * invoice. Prices come from the customer's channel; an invoice also checks
 * stock released by quality and the product's sale permit before saving.
 */
export function SaleFormPage({ kind }: { kind: 'quote' | 'invoice' }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sales = useQuery(SALES_KEY, fetchSales)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
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
    setLines(ql.map((l) => ({ key: nextKey++, productId: l.productId, qty: String(l.qty), price: baisaToInput(l.unitPriceBaisa), auto: false })))
    setLoaded(true)
  }, [existing.data, sales.data, loaded])

  const customer = customers.find((c) => nameKey(c.name) === nameKey(customerName))
  const channelPrice = (productId: string, channelId = customer?.channelId) => {
    const p = sales.data?.prices.find((x) => x.channelId === channelId && x.productId === productId)
    return p ? baisaToInput(p.priceBaisa) : ''
  }

  // Opened from a customer's page: start with that customer
  const fromCustomer = params.get('customer')
  useEffect(() => {
    const c = sales.data?.customers.find((x) => x.id === fromCustomer)
    if (c) setCustomerName((v) => v || c.name)
  }, [sales.data, fromCustomer])

  // A different customer may be on a different channel: refresh prices not typed by hand
  useEffect(() => {
    setLines((ls) => ls.map((l) => (l.auto && l.productId ? { ...l, price: channelPrice(l.productId) } : l)))
  }, [customer?.id, sales.data])

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
                `${nameOf(prod)}: المطلوب ${formatQty(need)} والمتاح للبيع (فحص مقبول) ${formatQty(sellable)}`,
                `${nameOf(prod)}: need ${formatQty(need)}, released for sale ${formatQty(sellable)}`,
              ),
            )
          return out
        })
      : []

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
      }
      const newId = kind === 'invoice' ? await createInvoice(draft) : await saveQuotation(draft, id)
      navigate(kind === 'invoice' ? `/invoices/${newId}` : `/quotes/${newId}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
      setSaving(false)
    }
  }

  const title = kind === 'invoice' ? t('فاتورة مباشرة', 'Direct invoice') : id ? t('تعديل عرض السعر', 'Edit quotation') : t('عرض سعر جديد', 'New quotation')

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
                    ? (sales.data?.channels.find((c) => c.id === customer.channelId)?.name ?? t('بلا قناة — الأسعار تُكتب يدوياً', 'No channel — type the prices'))
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
              return (
                <div key={l.key} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <Field label={t('المنتج', 'Product')} className="col-span-2 sm:col-span-1">
                    <Select
                      value={l.productId}
                      onChange={(e) => update(l.key, { productId: e.target.value, price: l.auto || !l.price ? channelPrice(e.target.value) : l.price, auto: l.auto || !l.price })}
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
                  <Field label={t('سعر العبوة', 'Unit price')}>
                    <NumberInput value={l.price} onChange={(e) => update(l.key, { price: e.target.value, auto: false })} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
                  </Field>
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
            <p className="mt-1">{t('البيع يحتاج تصريح بيع ساري ودفعة فحصها «مقبول». يمكن حفظه كعرض سعر بدلاً من ذلك.', 'Selling needs a valid sale permit and a batch checked «pass». You can save it as a quotation instead.')}</p>
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
