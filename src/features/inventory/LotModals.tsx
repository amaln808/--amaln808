import { useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Segmented, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { addOpeningStock, adjustLot, type Item, type Lot } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { parseRialToBaisa } from '../../domain/money'
import { formatQty, parseQty, unitLabel } from '../../domain/quantity'
import { t } from '../../i18n/index'

type Mode = 'waste' | 'less' | 'more'

/** Record waste, a shortage, or extra found on one lot. */
export function AdjustLotModal({ item, lot, onClose }: { item: Item; lot: Lot; onClose: () => void }) {
  const expired = !!lot.expiryDate && lot.expiryDate < todayIso()
  const [mode, setMode] = useState<Mode>('waste')
  const [qty, setQty] = useState(expired ? String(lot.qtyRemaining) : '')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState(expired ? t('منتهي الصلاحية', 'Expired') : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const q = parseQty(qty)
    if (!q) return setError(t('الكمية غير صحيحة.', 'Invalid quantity.'))
    setBusy(true)
    setError(null)
    try {
      await adjustLot(lot.id, mode === 'more' ? q : -q, mode === 'waste' ? 'waste' : 'adjustment', date, notes.trim() || null)
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
      title={t(`تعديل الدفعة ${lot.lotCode ?? ''}`, `Adjust lot ${lot.lotCode ?? ''}`)}
      footer={
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t(`المتبقي في هذه الدفعة: ${formatQty(lot.qtyRemaining, item.unit)}`, `Left in this lot: ${formatQty(lot.qtyRemaining, item.unit)}`)}
        </p>
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'waste', label: t('تالف', 'Waste') },
            { value: 'less', label: t('نقص في الجرد', 'Count short') },
            { value: 'more', label: t('زيادة في الجرد', 'Count over') },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الكمية', 'Quantity')}>
            <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={unitLabel(item.unit)} />
          </Field>
          <Field label={t('التاريخ', 'Date')}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('السبب', 'Reason')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}

/** Stock found or already on hand, entered as a new lot. */
export function AddStockModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [expiry, setExpiry] = useState('')
  const [lot, setLot] = useState('')
  const [date, setDate] = useState(todayIso())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const q = parseQty(qty)
    const c = cost.trim() ? parseRialToBaisa(cost) : 0
    if (!q) return setError(t('الكمية غير صحيحة.', 'Invalid quantity.'))
    if (c === null || c < 0) return setError(t('تكلفة الوحدة غير صحيحة.', 'Invalid unit cost.'))
    setBusy(true)
    setError(null)
    try {
      await addOpeningStock({ itemId: item.id, qty: q, unitCostBaisa: c, date, expiryDate: expiry || null, lotCode: lot.trim() || null })
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
      title={t('إضافة رصيد', 'Add stock')}
      footer={
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t('للكميات الموجودة قبل استخدام التطبيق. المشتريات الجديدة تُسجَّل من صفحة المورد.', 'For stock that existed before using the app. New purchases are recorded from the supplier page.')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الكمية', 'Quantity')}>
            <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={unitLabel(item.unit)} />
          </Field>
          <Field label={t('تكلفة الوحدة', 'Unit cost')}>
            <NumberInput value={cost} onChange={(e) => setCost(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
          </Field>
          <Field label={item.requiresExpiry ? t('تاريخ الانتهاء', 'Expiry date') : t('تاريخ الانتهاء (اختياري)', 'Expiry (optional)')}>
            <DateInput value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label={t('رقم الدفعة (اختياري)', 'Lot no. (optional)')}>
            <TextInput dir="ltr" value={lot} onChange={(e) => setLot(e.target.value)} />
          </Field>
          <Field label={t('التاريخ', 'Date')}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
