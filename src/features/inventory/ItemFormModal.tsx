import { t } from '../../i18n/index'
import { useEffect, useState } from 'react'
import { Field, FormError, NumberInput, Select, TextInput } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import type { Item, ItemType } from '../../db/types'
import { baisaToInput, parseRialToBaisa } from '../../domain/money'
import { parseQty, UNIT_LABELS, type Unit } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { createItem, updateItem } from '../../services/items'

interface Props {
  open: boolean
  onClose: () => void
  /** Item to edit; omit to create */
  item?: Item
  defaultType?: ItemType
}

export function ItemFormModal({ open, onClose, item, defaultType = 'raw' }: Props) {
  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [type, setType] = useState<ItemType>(defaultType)
  const [unit, setUnit] = useState<Unit>('kg')
  const [minQty, setMinQty] = useState('0')
  const [salePrice, setSalePrice] = useState('')
  const [packageSize, setPackageSize] = useState('')
  const [openingQty, setOpeningQty] = useState('')
  const [openingCost, setOpeningCost] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? '')
    setNameEn(item?.nameEn ?? '')
    setType(item?.type ?? defaultType)
    setUnit(item?.unit ?? (defaultType === 'raw' ? 'kg' : 'piece'))
    setMinQty(String(item?.minQty ?? 0))
    setSalePrice(item?.salePriceBaisa != null ? baisaToInput(item.salePriceBaisa) : '')
    setPackageSize(item?.packageSizeG != null ? String(item.packageSizeG) : '')
    setOpeningQty('')
    setOpeningCost('')
    setError(null)
  }, [open, item, defaultType])

  const save = async () => {
    setError(null)
    const min = parseQty(minQty || '0')
    if (min == null) return setError(t("الحد الأدنى غير صحيح", "Invalid minimum"))
    const price = salePrice ? parseRialToBaisa(salePrice) : undefined
    if (price === null) return setError(t("سعر البيع غير صحيح", "Invalid sale price"))
    const pkg = packageSize ? parseQty(packageSize) : undefined
    if (pkg === null) return setError(t("وزن العبوة غير صحيح", "Invalid package weight"))

    const input = {
      name,
      nameEn,
      type,
      unit,
      minQty: min,
      salePriceBaisa: type === 'finished' ? price : undefined,
      packageSizeG: type === 'finished' ? pkg : undefined,
    }

    let opening
    if (!item && openingQty) {
      const q = parseQty(openingQty)
      const c = parseRialToBaisa(openingCost || '0')
      if (q == null || c == null) return setError(t("الرصيد الافتتاحي غير صحيح", "Invalid opening balance"))
      opening = { qty: q, unitCostBaisa: c }
    }

    setSaving(true)
    try {
      if (item) await updateItem(db, item.id, { ...input, active: item.active })
      else await createItem(db, input, opening)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? t("تعديل الصنف", "Edit item") : t("صنف جديد", "New item")}
      footer={
        <>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {ar.common.save}
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {ar.common.cancel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("اسم الصنف (عربي)", "Item name (Arabic)")}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus dir="rtl" />
          </Field>
          <Field label={t("الاسم بالإنجليزية", "Item name (English)")} hint={t("يظهر في الواجهة والمستندات الإنجليزية", "Used in the English UI and documents")}>
            <TextInput value={nameEn} onChange={(e) => setNameEn(e.target.value)} dir="ltr" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("النوع", "Type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
              {(Object.keys(ar.itemTypes) as ItemType[]).map((t) => (
                <option key={t} value={t}>
                  {ar.itemTypes[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("وحدة القياس", "Unit")}>
            <Select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {(Object.keys(UNIT_LABELS) as Unit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("الحد الأدنى للتنبيه", "Alert minimum")} hint={t("يظهر تنبيه عندما يصل الرصيد إلى هذا الحد أو أقل", "An alert appears when stock reaches this level or below")}>
          <NumberInput value={minQty} onChange={(e) => setMinQty(e.target.value)} suffix={UNIT_LABELS[unit]} />
        </Field>
        {type === 'finished' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("سعر البيع", "Sale price")}>
              <NumberInput value={salePrice} onChange={(e) => setSalePrice(e.target.value)} suffix={t("ر.ع", "OMR")} placeholder="0.000" />
            </Field>
            <Field label={t("وزن العبوة (تقريبي)", "Package weight (approx.)")}>
              <NumberInput value={packageSize} onChange={(e) => setPackageSize(e.target.value)} suffix={t("جم", "g")} />
            </Field>
          </div>
        )}
        {!item && (
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="mb-3 text-sm font-medium">{t("رصيد افتتاحي (اختياري)", "Opening balance (optional)")}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("الكمية الموجودة", "Quantity on hand")}>
                <NumberInput value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} suffix={UNIT_LABELS[unit]} />
              </Field>
              <Field label={t("تكلفة الوحدة", "Unit cost")}>
                <NumberInput value={openingCost} onChange={(e) => setOpeningCost(e.target.value)} suffix={t("ر.ع", "OMR")} placeholder="0.000" />
              </Field>
            </div>
          </div>
        )}
        <FormError message={error} />
      </div>
    </Modal>
  )
}
