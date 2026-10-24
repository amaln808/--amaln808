import { addDays, format, parseISO } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Button, Card, PageHeader } from '../../components/ui'
import { serverError } from '../../data/errors'
import { fetchItemsWithStock, fetchOpenLots, INVENTORY_KEY } from '../../data/inventory'
import { createBatch, fetchRecipes, PRODUCTION_KEY } from '../../data/production'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { fefoEstimate, planFromRecipe } from '../../domain/fefo'
import { formatOMR, parseRialToBaisa } from '../../domain/money'
import { formatQty, parseQty, unitLabel } from '../../domain/quantity'
import { nameOf, t } from '../../i18n/index'

interface Row {
  key: number
  itemId: string
  qty: string
}
let nextKey = 1

export function BatchFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const items = useQuery(INVENTORY_KEY, fetchItemsWithStock)
  const lots = useQuery(`${INVENTORY_KEY}:lots`, fetchOpenLots)
  const recipes = useQuery(PRODUCTION_KEY + ':recipes', fetchRecipes)
  const all = (items.data ?? []).filter((i) => i.active)
  const byId = new Map(all.map((i) => [i.id, i]))
  const products = all.filter((i) => i.type === 'finished')
  const materials = all.filter((i) => i.type !== 'finished')

  const [productId, setProductId] = useState(params.get('product') ?? '')
  const [qty, setQty] = useState(params.get('qty') ?? '')
  const [date, setDate] = useState(todayIso())
  const [expiry, setExpiry] = useState('')
  const [expiryTouched, setExpiryTouched] = useState(false)
  const [extra, setExtra] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [rowsTouched, setRowsTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const product = byId.get(productId)
  const units = parseQty(qty) ?? 0
  const recipe = recipes.data?.find((r) => r.productId === productId)

  // Suggest consumption from the recipe until the user edits a row
  useEffect(() => {
    if (rowsTouched || !recipe) return
    setRows(planFromRecipe(recipe.components, units).map((c) => ({ key: nextKey++, itemId: c.itemId, qty: c.qty ? String(c.qty) : '' })))
  }, [productId, units, recipe, rowsTouched])

  // Suggest expiry = production date + shelf life
  useEffect(() => {
    if (expiryTouched || !product?.shelfLifeDays || !date) return
    setExpiry(format(addDays(parseISO(date), product.shelfLifeDays), 'yyyy-MM-dd'))
  }, [date, product?.shelfLifeDays, expiryTouched])

  const lotsOf = (id: string) => (lots.data ?? []).filter((l) => l.itemId === id)
  const evaluated = rows.map((r) => {
    const q = parseQty(r.qty)
    const est = r.itemId && q ? fefoEstimate(lotsOf(r.itemId), q, date) : { cost: 0, available: r.itemId ? fefoEstimate(lotsOf(r.itemId), 0, date).available : 0, shortage: 0 }
    return { ...r, q, ...est }
  })
  const materialsCost = Math.round(evaluated.reduce((s, r) => s + r.cost, 0))
  const extraBaisa = extra.trim() ? parseRialToBaisa(extra) : 0
  const total = materialsCost + (extraBaisa ?? 0)
  const short = evaluated.filter((r) => r.shortage > 0)

  const updateRow = (key: number, patch: Partial<Row>) => {
    setRowsTouched(true)
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const save = async () => {
    setError(null)
    if (!product) return setError(t('اختيار المنتج مطلوب.', 'Choose the product.'))
    if (!units) return setError(t('الكمية المنتجة غير صحيحة.', 'Invalid quantity produced.'))
    if (extraBaisa === null || extraBaisa < 0) return setError(t('التكاليف الإضافية غير صحيحة.', 'Invalid extra costs.'))
    const used = evaluated.filter((r) => r.itemId || r.qty)
    if (used.some((r) => !r.itemId || !r.q)) return setError(t('كل سطر استهلاك يحتاج مادة وكمية صحيحة.', 'Each consumption row needs a material and a valid quantity.'))
    if (short.length) return setError(t('المواد غير كافية — يرجى مراجعة الأسطر المظللة بالأحمر.', 'Not enough materials — see the rows in red.'))
    setBusy(true)
    try {
      const id = await createBatch({
        productId,
        productionDate: date,
        expiryDate: expiry || null,
        qtyProduced: units,
        extraCostBaisa: extraBaisa ?? 0,
        notes: notes.trim() || null,
        consumption: used.map((r) => ({ itemId: r.itemId, qty: r.q! })),
      })
      navigate(`/production/${id}`, { replace: true })
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title={t('دفعة إنتاج جديدة', 'New production batch')} back={{ to: '/production', label: t('التصنيع', 'Production') }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('المنتج', 'Product')} className="sm:col-span-2 lg:col-span-1">
              <Select
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value)
                  setRowsTouched(false)
                  setExpiryTouched(false)
                }}
              >
                <option value="">{t('اختيار المنتج…', 'Choose product…')}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('الكمية المنتجة', 'Quantity produced')}>
              <NumberInput value={qty} onChange={(e) => setQty(e.target.value)} suffix={t('عبوة', 'units')} />
            </Field>
            <Field label={t('تاريخ الإنتاج', 'Production date')}>
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('تاريخ الانتهاء', 'Expiry date')} hint={product?.shelfLifeDays ? t(`مقترح: ${product.shelfLifeDays} يوماً بعد الإنتاج`, `Suggested: ${product.shelfLifeDays} days after production`) : undefined}>
              <DateInput
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value)
                  setExpiryTouched(true)
                }}
              />
            </Field>
            <Field label={t('تكاليف مباشرة إضافية (اختياري)', 'Extra direct costs (optional)')} hint={t('مثل غاز التشغيل. الرواتب لا تدخل هنا.', 'e.g. cooking gas. Salaries are not included here.')}>
              <NumberInput value={extra} onChange={(e) => setExtra(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
            </Field>
          </div>
          {productId && !recipe && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('لا توجد وصفة لهذا المنتج؛ يمكن إضافة المواد يدوياً أو حفظ وصفة من صفحة المنتج.', 'No recipe for this product; add materials by hand or save a recipe on the product page.')}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-bold">{t('الاستهلاك الفعلي', 'Actual consumption')}</h2>
          <p className="mb-4 text-sm text-muted">{t('مقترح من الوصفة؛ يمكن تعديله. يُصرف من الأقرب انتهاءً أولاً.', 'Suggested from the recipe; edit as needed. Taken from the nearest expiry first.')}</p>
          <div className="flex flex-col gap-3">
            {evaluated.map((r) => {
              const item = byId.get(r.itemId)
              return (
                <div key={r.key} className={`grid grid-cols-[1fr_8rem_auto] items-end gap-2 rounded-xl p-2 sm:grid-cols-[1fr_9rem_10rem_auto] ${r.shortage > 0 ? 'bg-red-50' : ''}`}>
                  <Field label={t('المادة', 'Material')}>
                    <Select value={r.itemId} onChange={(e) => updateRow(r.key, { itemId: e.target.value })}>
                      <option value="">{t('اختيار…', 'Choose…')}</option>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {nameOf(m)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('الكمية', 'Qty')}>
                    <NumberInput value={r.qty} onChange={(e) => updateRow(r.key, { qty: e.target.value })} suffix={item ? unitLabel(item.unit) : undefined} />
                  </Field>
                  <div className="hidden min-h-12 flex-col justify-center text-sm sm:flex">
                    <span className={r.shortage > 0 ? 'font-bold text-red-700' : 'text-muted'}>
                      {r.shortage > 0
                        ? t(`ناقص ${formatQty(r.shortage, item?.unit)}`, `Short ${formatQty(r.shortage, item?.unit)}`)
                        : t(`متاح ${formatQty(r.available, item?.unit)}`, `${formatQty(r.available, item?.unit)} available`)}
                    </span>
                    <span className="num text-muted">{formatOMR(Math.round(r.cost))}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => (setRowsTouched(true), setRows((rs) => rs.filter((x) => x.key !== r.key)))}
                    className="flex size-12 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-700"
                    aria-label={t('حذف', 'Remove')}
                  >
                    <Trash2 className="size-5" />
                  </button>
                  {r.shortage > 0 && (
                    <p className="col-span-full text-sm font-medium text-red-700 sm:hidden">
                      {t(`ناقص ${formatQty(r.shortage, item?.unit)}`, `Short ${formatQty(r.shortage, item?.unit)}`)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <Button variant="ghost" className="mt-2" onClick={() => (setRowsTouched(true), setRows((rs) => [...rs, { key: nextKey++, itemId: '', qty: '' }]))}>
            <Plus className="size-5" />
            {t('إضافة مادة', 'Add material')}
          </Button>
          <dl className="mt-4 grid gap-1 border-t border-line pt-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">{t('تكلفة المواد', 'Materials')}</dt>
              <dd className="num font-bold">{formatOMR(materialsCost)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('التكلفة الكلية', 'Total cost')}</dt>
              <dd className="num font-bold">{formatOMR(total)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{t('تكلفة العبوة (تقديرية)', 'Cost per unit (estimate)')}</dt>
              <dd className="num text-xl font-bold text-brand-800">{units ? formatOMR(Math.round(total / units)) : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <Field label={t('ملاحظات', 'Notes')}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none sm:min-w-48" onClick={save} disabled={busy}>
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ الدفعة', 'Save batch')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('إلغاء', 'Cancel')}
          </Button>
        </div>
      </div>
    </>
  )
}
