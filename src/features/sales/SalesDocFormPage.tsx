import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSettings } from '../../app/useSettings'
import { DateInput, Field, FormError, NumberInput, Segmented, Select, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Button, Card, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { PaymentMethod } from '../../db/types'
import { baisaToInput, formatOMR, lineTotal, ltr, parseRialToBaisa } from '../../domain/money'
import { findShortages, mergeConsumption } from '../../domain/production'
import { formatQty, parseQty } from '../../domain/quantity'
import { addDays, computeTotals } from '../../domain/sales'
import { ar } from '../../i18n/ar'
import { UserError } from '../../services/errors'
import { createInvoice, createQuote } from '../../services/sales'
import { CustomerFormModal } from './CustomerFormModal'

interface Line {
  key: number
  itemId: string
  qty: string
  price: string
}
let nextKey = 1
const emptyLine = (): Line => ({ key: nextKey++, itemId: '', qty: '', price: '' })

type PayMode = 'none' | 'full' | 'partial'

export function SalesDocFormPage({ kind }: { kind: 'invoice' | 'quote' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const quoteId = kind === 'invoice' ? params.get('quote') ?? undefined : undefined
  const settings = useSettings()
  const customers = useLiveQuery(
    async () => (await db.customers.toArray()).filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
  const products = useLiveQuery(
    async () => (await db.items.where('type').equals('finished').toArray()).filter((i) => i.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
  const sourceQuote = useLiveQuery(async () => (quoteId ? db.quotations.get(quoteId) : undefined), [quoteId])

  const [customerId, setCustomerId] = useState(params.get('customer') ?? '')
  const [date, setDate] = useState(today())
  const [until, setUntil] = useState('')
  const [untilTouched, setUntilTouched] = useState(false)
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [discount, setDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [payMode, setPayMode] = useState<PayMode>('none')
  const [paidAmount, setPaidAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const days = kind === 'invoice' ? settings?.invoiceDueDays ?? 15 : settings?.quoteValidityDays ?? 14
  useEffect(() => {
    if (!untilTouched && settings) setUntil(addDays(date, days))
  }, [date, days, untilTouched, settings])

  // Prefill from a quotation being converted
  useEffect(() => {
    if (!sourceQuote) return
    setCustomerId(sourceQuote.customerId)
    setLines(sourceQuote.lines.map((l) => ({ key: nextKey++, itemId: l.itemId, qty: String(l.qty), price: baisaToInput(l.unitPriceBaisa) })))
    setDiscount(sourceQuote.discountBaisa ? baisaToInput(sourceQuote.discountBaisa) : '')
    setNotes(sourceQuote.notes ?? '')
  }, [sourceQuote])

  const byId = new Map(products?.map((p) => [p.id, p]))
  const updateLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const pickItem = (key: number, itemId: string) => {
    const p = byId.get(itemId)
    const line = lines.find((l) => l.key === key)
    updateLine(key, { itemId, price: line?.price || (p?.salePriceBaisa != null ? baisaToInput(p.salePriceBaisa) : '') })
  }

  const parsed = lines.map((l) => ({ itemId: l.itemId, qty: parseQty(l.qty), unitPriceBaisa: parseRialToBaisa(l.price) }))
  const valid = parsed.filter((l) => l.itemId && l.qty && l.unitPriceBaisa != null) as Array<{ itemId: string; qty: number; unitPriceBaisa: number }>
  const discountBaisa = discount ? parseRialToBaisa(discount) : 0
  const totals = computeTotals(valid, discountBaisa ?? 0, settings?.vatRatePercent ?? 0)
  const shortages =
    kind === 'invoice'
      ? findShortages(mergeConsumption(valid.map((l) => ({ itemId: l.itemId, qty: l.qty }))), new Map(products?.map((p) => [p.id, p.qtyOnHand])))
      : []
  const shortIds = new Set(shortages.map((s) => s.itemId))

  const save = async () => {
    setError(null)
    const filled = lines.filter((l) => l.itemId || l.qty || l.price)
    if (filled.some((l) => !l.itemId)) return setError('اختر المنتج في كل بند')
    if (filled.some((l) => !parseQty(l.qty))) return setError('أدخل كمية صحيحة في كل بند')
    if (filled.some((l) => parseRialToBaisa(l.price) == null)) return setError('أدخل السعر في كل بند')
    if (discountBaisa == null) return setError('الخصم غير صحيح')
    if (discountBaisa > totals.subtotalBaisa) return setError('الخصم أكبر من المجموع')

    const docLines = filled.map((l) => ({ itemId: l.itemId, qty: parseQty(l.qty)!, unitPriceBaisa: parseRialToBaisa(l.price)! }))
    setSaving(true)
    try {
      if (kind === 'quote') {
        const id = await createQuote(db, { customerId, date, validUntil: until, lines: docLines, discountBaisa, notes })
        navigate(`/quotes/${id}`, { replace: true })
      } else {
        let paidNow
        if (payMode === 'full') paidNow = { amountBaisa: totals.totalBaisa, method }
        if (payMode === 'partial') {
          const amt = parseRialToBaisa(paidAmount)
          if (!amt || amt <= 0) throw new UserError('أدخل المبلغ المدفوع')
          paidNow = { amountBaisa: amt, method }
        }
        const id = await createInvoice(db, { customerId, date, dueDate: until, lines: docLines, discountBaisa, notes, quoteId, paidNow })
        navigate(`/invoices/${id}`, { replace: true })
      }
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const title = kind === 'quote' ? 'عرض سعر جديد' : sourceQuote ? `فاتورة من عرض ${sourceQuote.quoteNo}` : 'فاتورة بيع جديدة'

  return (
    <>
      <PageHeader title={title} back={{ to: '/customers', label: ar.nav.customers }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="العميل" className="sm:col-span-2 lg:col-span-1">
              <div className="flex gap-2">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">اختر العميل…</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" className="!px-3" onClick={() => setAddingCustomer(true)} aria-label="عميل جديد">
                  <Plus className="size-5" />
                </Button>
              </div>
            </Field>
            <Field label="التاريخ">
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={kind === 'invoice' ? 'تاريخ الاستحقاق' : 'ساري حتى'}>
              <DateInput
                value={until}
                onChange={(e) => {
                  setUntilTouched(true)
                  setUntil(e.target.value)
                }}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">المنتجات</h2>
          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const p = byId.get(l.itemId)
              const pl = parsed[idx]
              const lt = pl.qty && pl.unitPriceBaisa != null ? lineTotal(pl.qty, pl.unitPriceBaisa) : 0
              const short = shortIds.has(l.itemId)
              return (
                <div
                  key={l.key}
                  className={`grid grid-cols-2 items-end gap-3 rounded-2xl p-3 sm:grid-cols-[8rem_9rem_1fr_auto] lg:grid-cols-[1fr_8rem_9rem_8rem_auto] ${short ? 'bg-red-50 ring-1 ring-red-200' : 'bg-stone-50'}`}
                >
                  <Field label="المنتج" className="col-span-2 sm:col-span-4 lg:col-span-1">
                    <Select value={l.itemId} onChange={(e) => pickItem(l.key, e.target.value)}>
                      <option value="">اختر المنتج…</option>
                      {products?.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="الكمية">
                    <NumberInput value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} suffix="عبوة" />
                  </Field>
                  <Field label="سعر العبوة">
                    <NumberInput value={l.price} onChange={(e) => updateLine(l.key, { price: e.target.value })} suffix="ر.ع" placeholder="0.000" />
                  </Field>
                  <div className="flex min-h-12 flex-col justify-center">
                    <span className="num font-bold">{formatOMR(lt)}</span>
                    {kind === 'invoice' && p && (
                      <span className={`text-xs ${short ? 'font-bold text-red-700' : 'text-stone-500'}`}>
                        المتوفر: <span className="num">{formatQty(p.qtyOnHand)}</span>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                    className="flex size-12 items-center justify-center justify-self-end rounded-xl text-stone-400 hover:bg-red-100 hover:text-red-600"
                    aria-label="حذف البند"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              )
            })}
          </div>
          <Button type="button" variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-5" /> إضافة منتج
          </Button>
          {shortages.length > 0 && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              الكمية المطلوبة أكبر من المتوفر في المخزون. سجّل دفعة إنتاج أولاً أو قلّل الكمية.
            </p>
          )}

          <div className="mt-5 grid gap-4 border-t border-stone-200 pt-4 sm:grid-cols-2">
            <Field label="الخصم (اختياري)">
              <NumberInput value={discount} onChange={(e) => setDiscount(e.target.value)} suffix="ر.ع" placeholder="0.000" />
            </Field>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 self-end text-sm">
              <dt className="text-stone-500">المجموع</dt>
              <dd className="num">{formatOMR(totals.subtotalBaisa)}</dd>
              <dt className="text-stone-500">الخصم</dt>
              <dd className="num">{formatOMR(totals.discountBaisa)}</dd>
              <dt className="text-stone-500">ضريبة القيمة المضافة ({ltr(`${totals.vatRatePercent}%`)})</dt>
              <dd className="num">{formatOMR(totals.vatBaisa)}</dd>
              <dt className="text-base font-bold">الإجمالي</dt>
              <dd className="num text-base font-bold text-brand-800">{formatOMR(totals.totalBaisa)}</dd>
            </dl>
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-4">
            {kind === 'invoice' && (
              <>
                <h2 className="text-lg font-bold">الدفع</h2>
                <Segmented
                  value={payMode}
                  onChange={setPayMode}
                  options={[
                    { value: 'none', label: 'آجل' },
                    { value: 'full', label: 'مدفوعة بالكامل' },
                    { value: 'partial', label: 'دفعة جزئية' },
                  ]}
                />
                {payMode !== 'none' && (
                  <div className="grid grid-cols-2 gap-3">
                    {payMode === 'partial' && (
                      <Field label="المبلغ المدفوع">
                        <NumberInput value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} suffix="ر.ع" placeholder="0.000" />
                      </Field>
                    )}
                    <Field label="طريقة الدفع">
                      <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                        {(Object.keys(ar.paymentMethods) as PaymentMethod[]).map((m) => (
                          <option key={m} value={m}>{ar.paymentMethods[m]}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </>
            )}
            <Field label="ملاحظات (تظهر في المستند)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:min-w-48 sm:flex-none" onClick={save} disabled={saving || shortages.length > 0}>
            {kind === 'quote' ? 'حفظ عرض السعر' : 'حفظ الفاتورة'}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>
      <CustomerFormModal open={addingCustomer} onClose={() => setAddingCustomer(false)} onSaved={setCustomerId} />
    </>
  )
}
