import { nameOf, t } from '../../i18n/index'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, FormError, NumberInput, Select } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { db } from '../../db/db'
import type { Item, Recipe } from '../../db/types'
import { formatOMR } from '../../domain/money'
import { recipeUnitCost } from '../../domain/production'
import { parseQty, UNIT_LABELS } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { saveRecipe } from '../../services/recipes'

interface Row {
  key: number
  itemId: string
  qty: string
}
let nextKey = 1

export function RecipeFormModal({
  open,
  onClose,
  product,
  recipe,
  materials,
}: {
  open: boolean
  onClose: () => void
  product: Item
  recipe?: Recipe
  /** Active raw + packaging items */
  materials: Item[]
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setRows(
      recipe?.components.length
        ? recipe.components.map((c) => ({ key: nextKey++, itemId: c.itemId, qty: String(c.qtyPerUnit) }))
        : [{ key: nextKey++, itemId: '', qty: '' }],
    )
    setError(null)
  }, [open, recipe])

  const byId = new Map(materials.map((m) => [m.id, m]))
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const parsed = rows.map((r) => ({ itemId: r.itemId, qtyPerUnit: parseQty(r.qty) ?? 0 }))
  const estCost = recipeUnitCost(parsed.filter((c) => c.itemId), new Map(materials.map((m) => [m.id, m.avgCostBaisa])))

  const save = async () => {
    const filled = rows.filter((r) => r.itemId || r.qty)
    if (filled.some((r) => !r.itemId)) return setError(t("اختر المادة في كل سطر", "Choose the material on every line"))
    if (filled.some((r) => !parseQty(r.qty))) return setError(t("أدخل كمية صحيحة لكل مادة", "Enter a valid quantity for each material"))
    try {
      await saveRecipe(db, {
        finishedItemId: product.id,
        components: filled.map((r) => ({ itemId: r.itemId, qtyPerUnit: parseQty(r.qty)! })),
      })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const options = (type: Item['type']) =>
    materials.filter((m) => m.type === type).map((m) => <option key={m.id} value={m.id}>{nameOf(m)}</option>)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(`وصفة: ${product.name}`, `Recipe: ${nameOf(product)}`)}
      footer={
        <>
          <Button className="flex-1" onClick={save}>{t("حفظ الوصفة", "Save recipe")}</Button>
          <Button variant="secondary" className="flex-1" onClick={onClose}>{t("إلغاء", "Cancel")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-stone-500">{t("الكميات المطلوبة لإنتاج", "Quantities needed to produce")} <b>{t("عبوة واحدة", "one jar")}</b>.</p>
        {rows.map((r) => {
          const item = byId.get(r.itemId)
          return (
            <div key={r.key} className="grid grid-cols-[1fr_8.5rem_auto] items-end gap-2">
              <Field label={t("المادة", "Material")}>
                <Select value={r.itemId} onChange={(e) => update(r.key, { itemId: e.target.value })}>
                  <option value="">{t("اختر…", "Choose…")}</option>
                  <optgroup label={ar.itemTypes.raw}>{options('raw')}</optgroup>
                  <optgroup label={ar.itemTypes.packaging}>{options('packaging')}</optgroup>
                </Select>
              </Field>
              <Field label={t("لكل عبوة", "Per jar")}>
                <NumberInput value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} suffix={item ? UNIT_LABELS[item.unit] : undefined} />
              </Field>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="flex size-12 items-center justify-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600"
                aria-label={t("حذف المكوّن", "Remove component")}
              >
                <Trash2 className="size-5" />
              </button>
            </div>
          )
        })}
        <Button type="button" variant="ghost" className="self-start" onClick={() => setRows((rs) => [...rs, { key: nextKey++, itemId: '', qty: '' }])}>
          <Plus className="size-5" /> {t("إضافة مكوّن", "Add component")}
        </Button>
        <div className="flex justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <span>{t("تكلفة المواد التقديرية للعبوة (بالأسعار الحالية)", "Estimated material cost per jar (current prices)")}</span>
          <b className="num">{formatOMR(Math.round(estCost))}</b>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
