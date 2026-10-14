import { useEffect, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Segmented, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { Item } from '../../db/types'
import { baisaToInput, parseRialToBaisa } from '../../domain/money'
import { formatQty, parseQty, UNIT_LABELS } from '../../domain/quantity'
import { adjustStock } from '../../services/stock'

type Mode = 'increase' | 'decrease' | 'waste'

export function AdjustModal({
  open,
  onClose,
  item,
  initialMode = 'decrease',
}: {
  open: boolean
  onClose: () => void
  item: Item
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [date, setDate] = useState(today())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setQty('')
    setCost(baisaToInput(item.avgCostBaisa))
    setDate(today())
    setNotes('')
    setError(null)
  }, [open, initialMode, item.avgCostBaisa])

  const save = async () => {
    const q = parseQty(qty)
    if (!q) return setError('أدخل كمية صحيحة')
    const c = mode === 'increase' ? parseRialToBaisa(cost || '0') : undefined
    if (c === null) return setError('التكلفة غير صحيحة')
    try {
      await adjustStock(db, {
        itemId: item.id,
        date,
        type: mode === 'waste' ? 'waste' : 'adjustment',
        qty: mode === 'increase' ? q : -q,
        unitCostBaisa: c,
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
      title={`تسوية مخزون — ${item.name}`}
      footer={
        <>
          <Button className="flex-1" onClick={save}>
            حفظ
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            إلغاء
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'increase', label: 'زيادة' },
            { value: 'decrease', label: 'نقص' },
            { value: 'waste', label: 'تالف' },
          ]}
        />
        <p className="text-sm text-stone-500">
          الرصيد الحالي: <span className="num">{formatQty(item.qtyOnHand, item.unit)}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={UNIT_LABELS[item.unit]} autoFocus />
          </Field>
          <Field label="التاريخ">
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {mode === 'increase' && (
          <Field label="تكلفة الوحدة" hint="افتراضياً متوسط التكلفة الحالي">
            <NumberInput value={cost} onChange={(e) => setCost(e.target.value)} suffix="ر.ع" />
          </Field>
        )}
        <Field label="السبب / ملاحظات">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
