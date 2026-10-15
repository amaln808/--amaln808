import { t } from '../../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { errorMessage, formatDate } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { PaymentMethod } from '../../db/types'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { ar } from '../../i18n/ar'
import { invoicePaidAmounts, recordCustomerPayment } from '../../services/customers'

export function CustomerPaymentModal({
  open,
  onClose,
  customerId,
  invoiceId,
  balanceBaisa,
}: {
  open: boolean
  onClose: () => void
  customerId: string
  /** Pre-select an invoice */
  invoiceId?: string
  balanceBaisa: number
}) {
  const invoices = useLiveQuery(
    async () => (await db.salesInvoices.where('customerId').equals(customerId).toArray()).sort((a, b) => b.date.localeCompare(a.date)),
    [customerId],
  )
  const paid = useLiveQuery(() => invoicePaidAmounts(db), [])
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [linked, setLinked] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const unpaid = invoices?.filter((i) => i.totalBaisa - (paid?.get(i.id) ?? 0) > 0) ?? []

  useEffect(() => {
    if (!open) return
    setDate(today())
    setMethod('cash')
    setLinked(invoiceId ?? '')
    setNotes('')
    setError(null)
  }, [open, invoiceId])

  // Suggest the remaining amount of the chosen invoice, or the full balance
  useEffect(() => {
    if (!open) return
    const inv = invoices?.find((i) => i.id === linked)
    const suggestion = inv ? inv.totalBaisa - (paid?.get(inv.id) ?? 0) : balanceBaisa
    setAmount(suggestion > 0 ? baisaToInput(suggestion) : '')
  }, [open, linked, invoices, paid, balanceBaisa])

  const save = async () => {
    const amountBaisa = parseRialToBaisa(amount)
    if (!amountBaisa || amountBaisa <= 0) return setError(t("أدخل مبلغاً صحيحاً", "Enter a valid amount"))
    try {
      await recordCustomerPayment(db, { customerId, invoiceId: linked || undefined, date, amountBaisa, method, notes: notes.trim() || undefined })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("تسجيل دفعة من العميل", "Record customer payment")}
      footer={
        <>
          <Button className="flex-1" onClick={save}>{t("حفظ الدفعة", "Save batch")}</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t("إلغاء", "Cancel")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-stone-500">
          {t("المستحق على العميل:", "Owed by customer:")} <b className="num text-stone-900">{formatOMR(balanceBaisa)}</b>
        </p>
        <Field label={t("عن فاتورة (اختياري)", "For invoice (optional)")} hint={t("الدفعة العامة تُسدِّد أقدم الفواتير أولاً", "A general payment settles the oldest invoices first")}>
          <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
            <option value="">{t("دفعة عامة على الحساب", "General payment on account")}</option>
            {unpaid.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNo} — {formatDate(i.date)} {t("— المتبقي", "— remaining")} {formatOMR(i.totalBaisa - (paid?.get(i.id) ?? 0))}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("المبلغ", "Amount")}>
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix={t("ر.ع", "OMR")} placeholder="0.000" />
          </Field>
          <Field label={t("التاريخ", "Date")}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("طريقة الدفع", "Payment method")}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {(Object.keys(ar.paymentMethods) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{ar.paymentMethods[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("ملاحظات", "Notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
