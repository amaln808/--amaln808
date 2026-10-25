import { useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import type { PaymentMethod } from '../../data/inventory'
import { type Invoice, recordCustomerPayment } from '../../data/sales'
import { todayIso } from '../../data/schedule'
import { baisaToInput, formatOMR, parseRialToBaisa } from '../../domain/money'
import { t } from '../../i18n/index'
import { METHODS, methodLabel } from '../inventory/labels'
import { formatDate } from '../tasks/labels'
import type { InvoiceInfo } from './summary'

/**
 * A payment from a customer, full or partial. Linked to one invoice, or left
 * «on account» to settle the oldest unpaid invoices first. Works offline.
 */
export function CustomerPaymentModal({
  customerId,
  invoices,
  invoiceInfo,
  invoiceId,
  balanceBaisa,
  onClose,
}: {
  customerId: string
  /** The customer's issued invoices */
  invoices: Invoice[]
  invoiceInfo: Map<string, InvoiceInfo>
  /** Pre-selects an invoice */
  invoiceId?: string
  balanceBaisa: number
  onClose: () => void
}) {
  const left = (i: Invoice) => i.totalBaisa - (invoiceInfo.get(i.id)?.paidBaisa ?? 0)
  const unpaid = invoices.filter((i) => left(i) > 0)
  const suggest = (id: string) => {
    const inv = invoices.find((i) => i.id === id)
    const v = inv ? left(inv) : balanceBaisa
    return v > 0 ? baisaToInput(v) : ''
  }
  const [linked, setLinked] = useState(invoiceId ?? '')
  const [amount, setAmount] = useState(() => suggest(invoiceId ?? ''))
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
      await recordCustomerPayment({ customerId, invoiceId: linked || null, date, amountBaisa: a, method, notes: notes.trim() || null })
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
      title={t('تسجيل دفعة من العميل', 'Record a customer payment')}
      footer={
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('عن', 'For')} className="sm:col-span-2" hint={!linked ? t('تُوزَّع على أقدم الفواتير غير المدفوعة أولاً.', 'Settles the oldest unpaid invoices first.') : undefined}>
          <Select
            value={linked}
            onChange={(e) => {
              setLinked(e.target.value)
              setAmount(suggest(e.target.value))
            }}
          >
            <option value="">{t('تحت الحساب', 'On account')}</option>
            {unpaid.map((i) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNo} · {formatDate(i.date)} · {t('المتبقي', 'left')} {formatOMR(left(i))}
              </option>
            ))}
          </Select>
        </Field>
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
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
