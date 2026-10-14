import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DateInput, Field, FormError, NumberInput, Segmented, Select, TextInput, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Button, Card, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { Item, PaymentMethod } from '../../db/types'
import { baisaToInput, formatOMR, lineTotal, parseRialToBaisa } from '../../domain/money'
import { parseQty, UNIT_LABELS } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { createPurchase } from '../../services/purchases'
import { SupplierFormModal } from '../suppliers/SupplierFormModal'

interface LineDraft {
  key: number
  itemId: string
  qty: string
  cost: string
}

let nextKey = 1
const emptyLine = (): LineDraft => ({ key: nextKey++, itemId: '', qty: '', cost: '' })

type PayMode = 'none' | 'full' | 'partial'

export function PurchaseFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const suppliers = useLiveQuery(
    async () => (await db.suppliers.toArray()).filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
  const items = useLiveQuery(
    async () =>
      (await db.items.toArray())
        .filter((i) => i.active && i.type !== 'finished')
        .sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    [],
  )
  const itemById = new Map(items?.map((i) => [i.id, i]))

  const [supplierId, setSupplierId] = useState(params.get('supplier') ?? '')
  const [date, setDate] = useState(today())
  const [invoiceNo, setInvoiceNo] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [payMode, setPayMode] = useState<PayMode>('none')
  const [paidAmount, setPaidAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingSupplier, setAddingSupplier] = useState(false)

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const pickItem = (key: number, itemId: string) => {
    const item = itemById.get(itemId)
    const line = lines.find((l) => l.key === key)
    updateLine(key, {
      itemId,
      // Suggest the current average cost if the user hasn't typed one
      cost: line?.cost || !item?.avgCostBaisa ? (line?.cost ?? '') : baisaToInput(item.avgCostBaisa),
    })
  }

  const parsed = lines.map((l) => ({
    itemId: l.itemId,
    qty: parseQty(l.qty),
    unitCostBaisa: parseRialToBaisa(l.cost),
  }))
  const total = parsed.reduce(
    (s, l) => s + (l.qty != null && l.unitCostBaisa != null ? lineTotal(l.qty, l.unitCostBaisa) : 0),
    0,
  )

  const save = async () => {
    setError(null)
    const filled = parsed.filter((l, i) => l.itemId || lines[i].qty || lines[i].cost)
    if (filled.some((l) => !l.itemId)) return setError('اختر الصنف في كل بند')
    if (filled.some((l) => !l.qty)) return setError('أدخل كمية صحيحة في كل بند')
    if (filled.some((l) => l.unitCostBaisa == null)) return setError('أدخل سعر الوحدة في كل بند')

    let paidNow
    if (payMode === 'full') paidNow = { amountBaisa: total, method }
    if (payMode === 'partial') {
      const amt = parseRialToBaisa(paidAmount)
      if (!amt || amt <= 0) return setError('أدخل المبلغ المدفوع')
      if (amt > total) return setError('المبلغ المدفوع أكبر من إجمالي الفاتورة')
      paidNow = { amountBaisa: amt, method }
    }

    setSaving(true)
    try {
      const id = await createPurchase(db, {
        supplierId,
        date,
        supplierInvoiceNo: invoiceNo,
        notes,
        lines: filled.map((l) => ({ itemId: l.itemId, qty: l.qty!, unitCostBaisa: l.unitCostBaisa! })),
        paidNow,
      })
      navigate(`/purchases/${id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const itemOptions = (type: Item['type']) =>
    items?.filter((i) => i.type === type).map((i) => (
      <option key={i.id} value={i.id}>{i.name}</option>
    ))

  return (
    <>
      <PageHeader title="فاتورة شراء جديدة" back={{ to: '/suppliers', label: ar.nav.suppliers }} />

      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="المورد" className="sm:col-span-2 lg:col-span-1">
              <div className="flex gap-2">
                <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">اختر المورد…</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button type="button" variant="secondary" className="!px-3" onClick={() => setAddingSupplier(true)} aria-label="مورد جديد">
                  <Plus className="size-5" />
                </Button>
              </div>
            </Field>
            <Field label="التاريخ">
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="رقم فاتورة المورد (اختياري)">
              <TextInput value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">البنود</h2>
          <div className="flex flex-col gap-3">
            {lines.map((l, idx) => {
              const item = itemById.get(l.itemId)
              const p = parsed[idx]
              const lt = p.qty != null && p.unitCostBaisa != null ? lineTotal(p.qty, p.unitCostBaisa) : 0
              return (
                <div key={l.key} className="grid grid-cols-2 items-end gap-3 rounded-2xl bg-stone-50 p-3 lg:grid-cols-[1fr_8rem_9rem_7rem_auto] lg:bg-transparent lg:p-0">
                  <Field label="الصنف" className="col-span-2 lg:col-span-1">
                    <Select value={l.itemId} onChange={(e) => pickItem(l.key, e.target.value)}>
                      <option value="">اختر الصنف…</option>
                      <optgroup label={ar.itemTypes.raw}>{itemOptions('raw')}</optgroup>
                      <optgroup label={ar.itemTypes.packaging}>{itemOptions('packaging')}</optgroup>
                    </Select>
                  </Field>
                  <Field label="الكمية">
                    <NumberInput value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} suffix={item ? UNIT_LABELS[item.unit] : undefined} />
                  </Field>
                  <Field label="سعر الوحدة">
                    <NumberInput value={l.cost} onChange={(e) => updateLine(l.key, { cost: e.target.value })} suffix="ر.ع" placeholder="0.000" />
                  </Field>
                  <div className="flex min-h-12 items-center">
                    <span className="num font-bold">{formatOMR(lt)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [emptyLine()]))}
                    className="flex size-12 items-center justify-center justify-self-end rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="حذف البند"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              )
            })}
          </div>
          <Button type="button" variant="ghost" className="mt-3" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
            <Plus className="size-5" /> إضافة بند
          </Button>
          <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-4 text-lg">
            <span className="font-bold">الإجمالي</span>
            <span className="num font-bold">{formatOMR(total)}</span>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">الدفع</h2>
          <div className="flex flex-col gap-4">
            <Segmented
              value={payMode}
              onChange={setPayMode}
              options={[
                { value: 'none', label: 'آجل (غير مدفوعة)' },
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
            <Field label="ملاحظات">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Card>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none sm:min-w-48" onClick={save} disabled={saving}>
            حفظ الفاتورة
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            إلغاء
          </Button>
        </div>
      </div>

      <SupplierFormModal open={addingSupplier} onClose={() => setAddingSupplier(false)} onSaved={setSupplierId} />
    </>
  )
}
