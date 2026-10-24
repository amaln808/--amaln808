import { Camera, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DateInput, Field, FormError, NumberInput, Segmented, Select, Textarea, TextInput } from '../../components/form'
import { Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { compressImage, uploadFile } from '../../data/files'
import {
  createPurchase,
  fetchItemsWithStock,
  fetchSuppliers,
  INVENTORY_KEY,
  type PaymentMethod,
  SUPPLIERS_KEY,
} from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { formatOMR, lineTotal, parseRialToBaisa } from '../../domain/money'
import { parseQty, unitLabel } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'
import { METHODS, methodLabel } from '../inventory/labels'
import { SupplierFormModal } from '../suppliers/SupplierFormModal'

interface LineDraft {
  key: number
  itemId: string
  qty: string
  cost: string
  vat: string
  lot: string
  expiry: string
}

let nextKey = 1
const emptyLine = (): LineDraft => ({ key: nextKey++, itemId: '', qty: '', cost: '', vat: '', lot: '', expiry: '' })
type PayMode = 'none' | 'full' | 'partial'

export function PurchaseFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const suppliers = useQuery(SUPPLIERS_KEY, fetchSuppliers)
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const buyable = (items.data ?? []).filter((i) => i.active && i.type !== 'finished')
  const byId = new Map(buyable.map((i) => [i.id, i]))

  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '')
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
  const [addingSupplier, setAddingSupplier] = useState(false)
  const camera = useRef<HTMLInputElement>(null)

  const update = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
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
    if (!supplierId) return setError(t('اختيار المورد مطلوب.', 'Choose the supplier.'))
    const filled = lines.map((l, i) => ({ l, p: parsed[i] })).filter(({ l }) => l.itemId || l.qty || l.cost)
    if (!filled.length) return setError(t('يجب إضافة بند واحد على الأقل.', 'Add at least one line.'))
    for (const { l, p } of filled) {
      const item = byId.get(l.itemId)
      if (!item) return setError(t('اختيار الصنف مطلوب في كل بند.', 'Choose the item on every line.'))
      if (!p.qty) return setError(t(`الكمية غير صحيحة في «${nameOf(item)}».`, `Invalid quantity for «${nameOf(item)}».`))
      if (p.cost == null) return setError(t(`سعر الوحدة مطلوب في «${nameOf(item)}».`, `Unit price needed for «${nameOf(item)}».`))
      if (!Number.isFinite(p.vat) || p.vat < 0 || p.vat > 100) return setError(t('نسبة الضريبة غير صحيحة.', 'Invalid VAT rate.'))
      if (item.requiresExpiry && !l.expiry) return setError(t(`تاريخ الانتهاء مطلوب في «${nameOf(item)}».`, `Expiry date needed for «${nameOf(item)}».`))
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
        supplierId,
        date,
        supplierInvoiceNo: invoiceNo.trim() || null,
        notes: notes.trim() || null,
        attachmentPath,
        paidBaisa,
        method,
        lines: filled.map(({ l, p }) => ({
          itemId: l.itemId,
          qty: p.qty!,
          unitCostBaisa: p.cost!,
          vatRate: p.vat,
          supplierLotCode: l.lot.trim() || null,
          expiryDate: l.expiry || null,
        })),
      })
      navigate(`/purchases/${id}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
      setSaving(false)
    }
  }

  const options = (type: 'raw' | 'packaging') =>
    buyable
      .filter((i) => i.type === type)
      .map((i) => (
        <option key={i.id} value={i.id}>
          {nameOf(i)}
        </option>
      ))

  return (
    <>
      <PageHeader title={t('فاتورة شراء جديدة', 'New purchase')} back={{ to: supplierId ? `/suppliers/${supplierId}` : '/suppliers', label: t('الموردون', 'Suppliers') }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('المورد', 'Supplier')}>
              <div className="flex gap-2">
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">{t('اختيار المورد…', 'Choose supplier…')}</option>
                  {(suppliers.data ?? [])
                    .filter((s) => s.active && s.kind !== 'expenses')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
                <Button variant="secondary" className="!px-3" onClick={() => setAddingSupplier(true)} aria-label={t('مورد جديد', 'New supplier')}>
                  <Plus className="size-5" />
                </Button>
              </div>
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
              const item = byId.get(l.itemId)
              const p = parsed[idx]
              return (
                <div key={l.key} className="rounded-xl border border-line p-3">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-[2fr_1fr_1fr_6rem]">
                    <Field label={t('الصنف', 'Item')} className="col-span-2 lg:col-span-1">
                      <Select value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })}>
                        <option value="">{t('اختيار الصنف…', 'Choose item…')}</option>
                        <optgroup label={t('مواد خام', 'Raw materials')}>{options('raw')}</optgroup>
                        <optgroup label={t('تغليف', 'Packaging')}>{options('packaging')}</optgroup>
                      </Select>
                    </Field>
                    <Field label={t('الكمية', 'Quantity')}>
                      <NumberInput value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} suffix={item ? unitLabel(item.unit) : undefined} />
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
                    <Field label={item?.requiresExpiry === false ? t('الانتهاء (اختياري)', 'Expiry (optional)') : t('تاريخ الانتهاء', 'Expiry date')}>
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
      {addingSupplier && <SupplierFormModal onClose={(id) => (setAddingSupplier(false), id && setSupplierId(id))} />}
    </>
  )
}
