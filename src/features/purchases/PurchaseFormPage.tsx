import { Camera, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Combobox, DateInput, Field, FormError, NumberInput, Segmented, Select, Textarea, TextInput } from '../../components/form'
import { Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { compressImage, uploadFile } from '../../data/files'
import {
  createPurchase,
  fetchItemsWithStock,
  fetchLastPurchasePrices,
  fetchSuppliers,
  INVENTORY_KEY,
  type PaymentMethod,
  SUPPLIERS_KEY,
} from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { baisaToInput, formatOMR, lineTotal, parseRialToBaisa } from '../../domain/money'
import { literHint, parseQty, type Unit, unitLabel } from '../../domain/quantity'
import { nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { METHODS, methodLabel } from '../inventory/labels'
import { NewMaterialFields } from '../inventory/NewMaterialFields'

interface LineDraft {
  key: number
  /** Typed or picked; an unknown name becomes a new item with newType/newUnit. */
  itemName: string
  newType: 'raw' | 'packaging'
  newUnit: Unit
  qty: string
  cost: string
  vat: string
  lot: string
  expiry: string
}

let nextKey = 1
const emptyLine = (): LineDraft => ({ key: nextKey++, itemName: '', newType: 'raw', newUnit: 'kg', qty: '', cost: '', vat: '', lot: '', expiry: '' })
type PayMode = 'none' | 'full' | 'partial'

export function PurchaseFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const buyable = (items.data ?? []).filter((i) => i.active && i.type !== 'finished')
  const itemByName = new Map(buyable.map((i) => [nameKey(nameOf(i)), i]))
  const lastPrices = useQuery(`${INVENTORY_KEY}:last-prices`, fetchLastPurchasePrices)
  const activeSuppliers = (suppliers.data ?? []).filter((s) => s.active)

  const [supplierName, setSupplierName] = useState('')
  const supplier = activeSuppliers.find((s) => nameKey(s.name) === nameKey(supplierName))
  // Opened from a supplier's page: start with that supplier
  const fromSupplier = params.get('supplier')
  useEffect(() => {
    const s = suppliers.data?.find((x) => x.id === fromSupplier)
    if (s) setSupplierName((v) => v || s.name)
  }, [suppliers.data, fromSupplier])
  const [date, setDate] = useState(todayIso())
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [payMode, setPayMode] = useState<PayMode>('none')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const camera = useRef<HTMLInputElement>(null)

  const update = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  // Picking a known item fills in the price and VAT paid last time, if still empty
  const pickItem = (l: LineDraft, name: string) => {
    const last = itemByName.get(nameKey(name)) && lastPrices.data?.get(itemByName.get(nameKey(name))!.id)
    update(l.key, {
      itemName: name,
      ...(last && !l.cost.trim() ? { cost: baisaToInput(last.unitCostBaisa), vat: last.vatRate ? String(last.vatRate) : '' } : {}),
    })
  }
  const parsed = lines.map((l) => {
    const qty = parseQty(l.qty)
    const cost = parseRialToBaisa(l.cost)
    const vat = l.vat.trim() ? Number(l.vat.replace('٫', '.')) : 0
    const net = qty != null && cost != null ? lineTotal(qty, cost) : 0
    return { qty, cost, vat, net, vatBaisa: Math.round((net * (Number.isFinite(vat) ? vat : 0)) / 100) }
  })
  const subtotal = parsed.reduce((s, l) => s + l.net, 0)
  const vatTotal = parsed.reduce((s, l) => s + l.vatBaisa, 0)
  const total = subtotal + vatTotal

  const save = async () => {
    setError(null)
    if (!supplierName.trim()) return setError(t('اسم المورد مطلوب.', 'The supplier name is required.'))
    const filled = lines.map((l, i) => ({ l, p: parsed[i] })).filter(({ l }) => l.itemName.trim() || l.qty || l.cost)
    if (!filled.length) return setError(t('يجب إضافة بند واحد على الأقل.', 'Add at least one line.'))
    for (const { l, p } of filled) {
      const name = l.itemName.trim()
      if (!name) return setError(t('اسم الصنف مطلوب في كل بند.', 'Every line needs an item.'))
      const item = itemByName.get(nameKey(name))
      if (!p.qty) return setError(t(`الكمية غير صحيحة في «${name}».`, `Invalid quantity for «${name}».`))
      if (p.cost == null) return setError(t(`سعر الوحدة مطلوب في «${name}».`, `Unit price needed for «${name}».`))
      if (!Number.isFinite(p.vat) || p.vat < 0 || p.vat > 100) return setError(t('نسبة الضريبة غير صحيحة.', 'Invalid VAT rate.'))
      if ((item ? item.requiresExpiry : l.newType === 'raw') && !l.expiry)
        return setError(t(`تاريخ الانتهاء مطلوب في «${name}».`, `Expiry date needed for «${name}».`))
    }
    let paidBaisa = 0
    if (payMode === 'full') paidBaisa = total
    if (payMode === 'partial') {
      const a = parseRialToBaisa(paid)
      if (!a || a <= 0) return setError(t('المبلغ المدفوع غير صحيح.', 'Invalid amount paid.'))
      if (a > total) return setError(t('المبلغ المدفوع أكبر من الإجمالي.', 'Amount paid exceeds the total.'))
      paidBaisa = a
    }
    setSaving(true)
    try {
      let attachmentPath: string | null = null
      if (photo) attachmentPath = await uploadFile('receipts', `purchases/${crypto.randomUUID()}.jpg`, await compressImage(photo))
      const id = await createPurchase({
        supplierId: supplier?.id ?? null,
        supplierName: supplierName.trim(),
        date,
        supplierInvoiceNo: invoiceNo.trim() || null,
        notes: notes.trim() || null,
        attachmentPath,
        paidBaisa,
        method,
        lines: filled.map(({ l, p }) => {
          const item = itemByName.get(nameKey(l.itemName))
          return {
            itemId: item?.id ?? null,
            ...(item ? {} : { itemName: l.itemName.trim(), itemType: l.newType, unit: l.newUnit }),
            qty: p.qty!,
            unitCostBaisa: p.cost!,
            vatRate: p.vat,
            supplierLotCode: l.lot.trim() || null,
            expiryDate: l.expiry || null,
          }
        }),
      })
      navigate(`/purchases/${id}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
      setSaving(false)
    }
  }

  const supplierOptions = activeSuppliers.map((s) => ({ label: s.name, hint: s.kind ?? undefined }))
  const itemOptions = buyable.map((i) => ({
    label: nameOf(i),
    hint: `${i.type === 'raw' ? t('خام', 'Raw') : t('تغليف', 'Packaging')} · ${unitLabel(i.unit)}`,
  }))
  const newBadge = t('جديد', 'New')

  return (
    <>
      <PageHeader title={t('فاتورة شراء جديدة', 'New purchase')} back={{ to: fromSupplier ? `/suppliers/${fromSupplier}` : '/suppliers', label: t('الموردون', 'Suppliers') }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label={t('المورد', 'Supplier')}
              hint={supplierName.trim() && !supplier ? t('مورد جديد، سيُضاف عند الحفظ', 'New supplier, added on save') : undefined}
            >
              <Combobox value={supplierName} onChange={setSupplierName} options={supplierOptions} newLabel={newBadge} />
            </Field>
            <Field label={t('التاريخ', 'Date')}>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('رقم فاتورة المورد', 'Supplier invoice no.')}>
              <TextInput dir="ltr" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('البنود', 'Lines')}</h2>
          <div className="flex flex-col gap-4">
            {lines.map((l, idx) => {
              const item = itemByName.get(nameKey(l.itemName))
              const isNew = !item && !!l.itemName.trim()
              const unit = item?.unit ?? (isNew ? l.newUnit : undefined)
              const p = parsed[idx]
              return (
                <div key={l.key} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr_6rem]">
                    <Field label={t('الصنف', 'Item')} className="col-span-2 lg:col-span-1">
                      <Combobox value={l.itemName} onChange={(v) => pickItem(l, v)} options={itemOptions} newLabel={newBadge} />
                    </Field>
                    <Field label={t('الكمية', 'Quantity')} hint={literHint(unit, l.qty)}>
                      <NumberInput value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} suffix={unit ? unitLabel(unit) : undefined} />
                    </Field>
                    <Field label={t('سعر الوحدة (قبل الضريبة)', 'Unit price (before VAT)')}>
                      <NumberInput value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value })} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
                    </Field>
                    <Field label={t('ضريبة %', 'VAT %')}>
                      <NumberInput value={l.vat} onChange={(e) => update(l.key, { vat: e.target.value })} placeholder="0" />
                    </Field>
                    <Field label={t('رقم دفعة المورد', 'Supplier lot no.')}>
                      <TextInput dir="ltr" value={l.lot} onChange={(e) => update(l.key, { lot: e.target.value })} />
                    </Field>
                    {isNew && (
                      <NewMaterialFields
                        className="col-span-2 lg:col-span-4"
                        type={l.newType}
                        unit={l.newUnit}
                        onChange={(v) => update(l.key, { newType: v.type, newUnit: v.unit })}
                      />
                    )}
                    <Field label={(item ? !item.requiresExpiry : l.newType === 'packaging') ? t('الانتهاء (اختياري)', 'Expiry (optional)') : t('تاريخ الانتهاء', 'Expiry date')}>
                      <DateInput value={l.expiry} onChange={(e) => update(l.key, { expiry: e.target.value })} />
                    </Field>
                    <div className="flex items-end justify-between gap-2 lg:col-span-2">
                      <span className="num flex min-h-12 items-center font-bold">{formatOMR(p.net + p.vatBaisa)}</span>
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
                </div>
              )
            })}
          </div>
          <Button variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-5" /> {t('إضافة بند', 'Add line')}
          </Button>
          <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-4">
            {vatTotal > 0 && (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted">{t('قبل الضريبة', 'Before VAT')}</dt>
                  <dd className="num">{formatOMR(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">{t('الضريبة المدفوعة', 'VAT paid')}</dt>
                  <dd className="num">{formatOMR(vatTotal)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between text-lg font-bold">
              <dt>{t('الإجمالي', 'Total')}</dt>
              <dd className="num">{formatOMR(total)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t('الدفع', 'Payment')}</h2>
          <div className="flex flex-col gap-4">
            <Segmented<PayMode>
              value={payMode}
              onChange={setPayMode}
              options={[
                { value: 'none', label: t('آجل', 'On credit') },
                { value: 'full', label: t('مدفوعة بالكامل', 'Paid in full') },
                { value: 'partial', label: t('دفعة جزئية', 'Part paid') },
              ]}
            />
            {payMode !== 'none' && (
              <div className="grid grid-cols-2 gap-3">
                {payMode === 'partial' && (
                  <Field label={t('المبلغ المدفوع', 'Amount paid')}>
                    <NumberInput value={paid} onChange={(e) => setPaid(e.target.value)} suffix={t('ر.ع', 'OMR')} />
                  </Field>
                )}
                <Field label={t('طريقة الدفع', 'Method')}>
                  <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {methodLabel(m)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
            <Field label={t('ملاحظات', 'Notes')}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div>
              <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <Button variant="secondary" onClick={() => camera.current?.click()}>
                <Camera className="size-5" />
                {photo ? t('تم إرفاق صورة الفاتورة ✓', 'Invoice photo attached ✓') : t('تصوير فاتورة المورد (اختياري)', 'Photo of the invoice (optional)')}
              </Button>
            </div>
          </div>
        </Card>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none sm:min-w-48" onClick={save} disabled={saving}>
            {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الفاتورة', 'Save purchase')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('إلغاء', 'Cancel')}
          </Button>
        </div>
      </div>
    </>
  )
}
