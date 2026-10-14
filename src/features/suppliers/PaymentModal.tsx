import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { errorMessage, formatDate } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { PaymentMethod } from '../../db/types'
import { formatOMR, parseRialToBaisa } from '../../domain/money'
import { ar } from '../../i18n/ar'
import { recordSupplierPayment } from '../../services/suppliers'

export function PaymentModal({
  open,
  onClose,
  supplierId,
  balanceBaisa,
}: {
  open: boolean
  onClose: () => void
  supplierId: string
  balanceBaisa: number
}) {
  const purchases = useLiveQuery(
    async () => (await db.purchases.where('supplierId').equals(supplierId).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [supplierId],
  )
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [purchaseId, setPurchaseId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setDate(today())
    setMethod('cash')
    setPurchaseId('')
    setNotes('')
    setError(null)
  }, [open])

  const save = async () => {
    const amountBaisa = parseRialToBaisa(amount)
    if (!amountBaisa || amountBaisa <= 0) return setError('أدخل مبلغاً صحيحاً')
    try {
      await recordSupplierPayment(db, {
        supplierId,
        purchaseId: purchaseId || undefined,
        date,
        amountBaisa,
        method,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تسجيل دفعة للمورد"
      footer={
        <>
          <Button className="flex-1" onClick={save}>حفظ الدفعة</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-500">
          المستحق حالياً: <b className="num text-stone-900">{formatOMR(balanceBaisa)}</b>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ">
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix="ر.ع" placeholder="0.000" autoFocus />
          </Field>
          <Field label="التاريخ">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="طريقة الدفع">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(ar.paymentMethods) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{ar.paymentMethods[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="عن فاتورة (اختياري)">
          <Select value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
            <option value="">دفعة عامة على الحساب</option>
            {purchases?.map((p) => (
              <option key={p.id} value={p.id}>
                {formatDate(p.date)} — {p.supplierInvoiceNo ? `#${p.supplierInvoiceNo} — ` : ''}
                {formatOMR(p.totalBaisa)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ملاحظات">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
