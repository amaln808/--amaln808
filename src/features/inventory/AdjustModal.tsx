import { nameOf, t } from '../../i18n/index'
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
    if (!q) return setError(t("أدخل كمية صحيحة", "Enter a valid quantity"))
    const c = mode === 'increase' ? parseRialToBaisa(cost || '0') : undefined
    if (c === null) return setError(t("التكلفة غير صحيحة", "Invalid cost"))
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
      title={t(`تسوية مخزون — ${item.name}`, `Stock adjustment — ${nameOf(item)}`)}
      footer={
        <>
          <Button className="flex-1" onClick={save}>
            {t("حفظ", "Save")}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t("إلغاء", "Cancel")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'increase', label: t("زيادة", "Increase") },
            { value: 'decrease', label: t("نقص", "Decrease") },
            { value: 'waste', label: t("تالف", "Waste") },
          ]}
        />
        <p className="text-sm text-stone-500">
          {t("الرصيد الحالي:", "Current balance:")} <span className="num">{formatQty(item.qtyOnHand, item.unit)}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("الكمية", "Quantity")}>
            <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={UNIT_LABELS[item.unit]} autoFocus />
          </Field>
          <Field label={t("التاريخ", "Date")}>
            <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {mode === 'increase' && (
          <Field label={t("تكلفة الوحدة", "Unit cost")} hint={t("افتراضياً متوسط التكلفة الحالي", "Defaults to the current average cost")}>
            <NumberInput value={cost} onChange={(e) => setCost(e.target.value)} suffix={t("ر.ع", "OMR")} />
          </Field>
        )}
        <Field label={t("السبب / ملاحظات", "Reason / notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
