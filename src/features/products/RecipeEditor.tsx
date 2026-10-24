import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, FormError, NumberInput, Select } from '../../components/form'
import { Badge, Button, Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import type { ItemWithStock, Lot } from '../../data/inventory'
import { type Recipe, saveRecipe } from '../../data/production'
import { fefoEstimate } from '../../domain/fefo'
import { formatOMR } from '../../domain/money'
import { parseQty, unitLabel } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'

interface Row {
  key: number
  itemId: string
  qty: string
}
let nextKey = 1

/** Materials for one unit of the product, with what one unit costs at today's lot prices. */
export function RecipeEditor({
  productId,
  recipe,
  materials,
  lots,
  today,
}: {
  productId: string
  recipe: Recipe | undefined
  materials: ItemWithStock[]
  lots: Lot[]
  today: string
}) {
  const fromRecipe = () => (recipe?.components ?? []).map((c) => ({ key: nextKey++, itemId: c.itemId, qty: String(c.qtyPerUnit) }))
  const [rows, setRows] = useState<Row[]>(fromRecipe)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setRows(fromRecipe()), [recipe?.id, recipe?.components.length])

  const byId = new Map(materials.map((m) => [m.id, m]))
  const lotsOf = (id: string) => lots.filter((l) => l.itemId === id)
  const costPerUnit = rows.reduce((s, r) => {
    const q = parseQty(r.qty)
    return q && r.itemId ? s + fefoEstimate(lotsOf(r.itemId), q, today).cost : s
  }, 0)
  const update = (key: number, patch: Partial<Row>) => {
    setSaved(false)
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const save = async () => {
    const filled = rows.filter((r) => r.itemId || r.qty)
    for (const r of filled) {
      if (!r.itemId) return setError(t('اختيار المادة مطلوب في كل سطر.', 'Choose the material on every row.'))
      if (!parseQty(r.qty)) return setError(t(`الكمية غير صحيحة لـ «${nameOf(byId.get(r.itemId))}».`, `Invalid quantity for «${nameOf(byId.get(r.itemId))}».`))
    }
    if (new Set(filled.map((r) => r.itemId)).size !== filled.length) return setError(t('كل مادة مرة واحدة فقط.', 'Each material only once.'))
    setBusy(true)
    setError(null)
    try {
      await saveRecipe(productId, filled.map((r) => ({ itemId: r.itemId, qtyPerUnit: parseQty(r.qty)! })), false)
      setSaved(true)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{t('الوصفة لعبوة واحدة', 'Recipe for one unit')}</h2>
        {recipe?.isEstimate && <Badge tone="amber">{t('تقديرية — تُراجَع ثم تُحفظ', 'Estimate — review and save')}</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted">
        {t('تُستخدم لاقتراح الاستهلاك في دفعات الإنتاج، ويمكن تعديل الاستهلاك الفعلي في كل دفعة.', 'Suggests consumption for production batches; the actual use can be changed in each batch.')}
      </p>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const item = byId.get(r.itemId)
          const q = parseQty(r.qty)
          const est = item && q ? fefoEstimate(lotsOf(item.id), q, today).cost : 0
          return (
            <div key={r.key} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
              <Field label={t('المادة', 'Material')}>
                <Select value={r.itemId} onChange={(e) => update(r.key, { itemId: e.target.value })}>
                  <option value="">{t('اختيار…', 'Choose…')}</option>
                  <optgroup label={t('مواد خام', 'Raw materials')}>
                    {materials.filter((m) => m.type === 'raw').map((m) => (
                      <option key={m.id} value={m.id}>
                        {nameOf(m)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t('تغليف', 'Packaging')}>
                    {materials.filter((m) => m.type === 'packaging').map((m) => (
                      <option key={m.id} value={m.id}>
                        {nameOf(m)}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
              <Field label={t('الكمية', 'Qty')}>
                <NumberInput value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} suffix={item ? unitLabel(item.unit) : undefined} />
              </Field>
              <span className="num hidden min-h-12 items-center text-sm text-muted sm:flex">{formatOMR(Math.round(est))}</span>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-700"
                aria-label={t('حذف', 'Remove')}
              >
                <Trash2 className="size-5" />
              </button>
            </div>
          )
        })}
      </div>
      <Button variant="ghost" className="mt-2" onClick={() => setRows((rs) => [...rs, { key: nextKey++, itemId: '', qty: '' }])}>
        <Plus className="size-5" />
        {t('إضافة مادة', 'Add material')}
      </Button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          <div className="text-sm text-muted">{t('تكلفة المواد للعبوة بأسعار المخزون الحالية', 'Material cost per unit at current stock prices')}</div>
          <div className="num text-xl font-bold">{formatOMR(Math.round(costPerUnit))}</div>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-palm">{t('تم الحفظ', 'Saved')}</span>}
          <Button onClick={save} disabled={busy}>
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الوصفة', 'Save recipe')}
          </Button>
        </div>
      </div>
      <FormError message={error} />
    </Card>
  )
}
