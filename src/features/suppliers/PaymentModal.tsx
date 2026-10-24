import { useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { type PaymentMethod, recordSupplierPayment } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { t } from '../../i18n/index'
import { METHODS, methodLabel } from '../inventory/labels'

/** Pay a supplier, against one purchase or generally. Works offline (sent when back online). */
export function PaymentModal({
  supplierId,
  purchaseId = null,
  dueBaisa,
  onClose,
}: {
  supplierId: string
  purchaseId?: string | null
  dueBaisa: number
  onClose: () => void
}) {
  const [amount, setAmount] = useState(dueBaisa > 0 ? baisaToInput(dueBaisa) : '')
  const [date, setDate] = useState(todayIso())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const a = parseRialToBaisa(amount)
    if (!a || a <= 0) return setError(t('المبلغ غير صحيح.', 'Invalid amount.'))
    setBusy(true)
    setError(null)
    try {
      await recordSupplierPayment({ supplierId, purchaseId, date, amountBaisa: a, method, notes: notes.trim() || null })
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('تسجيل دفعة للمورد', 'Record a payment')}
      footer={
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t(`المستحق: ${formatOMR(dueBaisa)}`, `Due: ${formatOMR(dueBaisa)}`)}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('المبلغ', 'Amount')}>
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix={t('ر.ع', 'OMR')} />
          </Field>
          <Field label={t('التاريخ', 'Date')}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
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
        <Field label={t('ملاحظات', 'Notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
