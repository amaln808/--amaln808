import { useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Segmented, Select, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { serverError } from '../../data/errors'
import { addOpeningStock, type Item, type ItemDraft, saveItem } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { parseRialToBaisa } from '../../domain/money'
import { parseQty, type Unit, unitLabel } from '../../domain/quantity'
import { t } from '../../i18n/index'

const UNITS: Unit[] = ['kg', 'g', 'piece', 'liter']

/** Add or edit a raw material / packaging item, optionally with stock already on hand. */
export function ItemFormModal({ item, onClose }: { item?: Item; onClose: (savedId?: string) => void }) {
  const [f, setF] = useState<ItemDraft>(
    item ?? {
      type: 'raw',
      name: '',
      nameEn: null,
      unit: 'kg',
      sku: null,
      minQty: 0,
      requiresExpiry: true,
      description: null,
      weightG: null,
      photoPath: null,
      shelfLifeDays: null,
      vatRate: null,
      active: true,
    },
  )
  const [minQty, setMinQty] = useState(item ? String(item.minQty) : '')
  const [opening, setOpening] = useState({ qty: '', cost: '', expiry: '', lot: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    const min = minQty.trim() ? parseQty(minQty) : 0
    if (!f.name.trim()) return setError(t('اسم الصنف مطلوب.', 'The item name is required.'))
    if (min === null) return setError(t('الحد الأدنى غير صحيح.', 'Invalid minimum.'))
    const oQty = opening.qty.trim() ? parseQty(opening.qty) : null
    const oCost = opening.cost.trim() ? parseRialToBaisa(opening.cost) : 0
    if (!item && opening.qty.trim()) {
      if (!oQty) return setError(t('كمية الرصيد الافتتاحي غير صحيحة.', 'Invalid opening quantity.'))
      if (oCost === null || oCost < 0) return setError(t('تكلفة الوحدة غير صحيحة.', 'Invalid unit cost.'))
      if (f.requiresExpiry && !opening.expiry) return setError(t('تاريخ الانتهاء مطلوب للرصيد الافتتاحي.', 'Expiry date is required for the opening stock.'))
    }
    setBusy(true)
    setError(null)
    try {
      const id = await saveItem({ ...f, name: f.name.trim(), nameEn: f.nameEn?.trim() || null, minQty: min })
      if (!item && oQty) {
        await addOpeningStock({
          itemId: id,
          qty: oQty,
          unitCostBaisa: oCost ?? 0,
          date: todayIso(),
          expiryDate: opening.expiry || null,
          lotCode: opening.lot.trim() || null,
        })
      }
      onClose(id)
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const toggleActive = async () => {
    if (!item) return
    setBusy(true)
    try {
      await saveItem({ ...item, active: !item.active })
      onClose(item.id)
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => onClose()}
      title={item ? t('تعديل الصنف', 'Edit item') : t('صنف جديد', 'New item')}
      footer={
        <>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {item && (
            <Button variant="secondary" onClick={toggleActive} disabled={busy}>
              {item.active ? t('إيقاف الصنف', 'Deactivate') : t('إعادة تفعيل', 'Reactivate')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!item && (
          <Field label={t('النوع', 'Type')}>
            <Segmented
              value={f.type === 'packaging' ? 'packaging' : 'raw'}
              onChange={(v) => setF((x) => ({ ...x, type: v, requiresExpiry: v === 'raw', unit: v === 'raw' ? 'kg' : 'piece' }))}
              options={[
                { value: 'raw', label: t('مادة خام', 'Raw material') },
                { value: 'packaging', label: t('تغليف', 'Packaging') },
              ]}
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الاسم', 'Name')}>
            <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={t('مثال: معجون تمر', 'e.g. Date paste')} />
          </Field>
          <Field label={t('الاسم بالإنجليزية (اختياري)', 'English name (optional)')}>
            <TextInput dir="ltr" value={f.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value)} />
          </Field>
          <Field label={t('الوحدة', 'Unit')}>
            <Select value={f.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('الحد الأدنى للتنبيه', 'Alert below')} hint={t('يظهر تنبيه عندما يصل الرصيد لهذا الحد.', 'An alert shows when stock reaches this level.')}>
            <NumberInput value={minQty} onChange={(e) => setMinQty(e.target.value)} suffix={unitLabel(f.unit)} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={f.requiresExpiry} onChange={(e) => set('requiresExpiry', e.target.checked)} />
          {t('تاريخ الانتهاء إلزامي عند الشراء', 'Expiry date required when buying')}
        </label>

        {!item && (
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-2 text-sm font-medium">{t('رصيد موجود الآن (اختياري)', 'Stock on hand now (optional)')}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('الكمية', 'Quantity')}>
                <NumberInput value={opening.qty} onChange={(e) => setOpening((o) => ({ ...o, qty: e.target.value }))} suffix={unitLabel(f.unit)} />
              </Field>
              <Field label={t('تكلفة الوحدة', 'Unit cost')}>
                <NumberInput value={opening.cost} onChange={(e) => setOpening((o) => ({ ...o, cost: e.target.value }))} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
              </Field>
              <Field label={t('تاريخ الانتهاء', 'Expiry date')}>
                <DateInput value={opening.expiry} onChange={(e) => setOpening((o) => ({ ...o, expiry: e.target.value }))} />
              </Field>
              <Field label={t('رقم الدفعة (اختياري)', 'Lot no. (optional)')}>
                <TextInput dir="ltr" value={opening.lot} onChange={(e) => setOpening((o) => ({ ...o, lot: e.target.value }))} />
              </Field>
            </div>
          </fieldset>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  )
}
