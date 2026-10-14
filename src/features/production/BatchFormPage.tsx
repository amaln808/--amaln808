import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Button, Card, PageHeader } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import type { Item, Recipe } from '../../db/types'
import { formatOMR, lineTotal, parseRialToBaisa } from '../../domain/money'
import { computeBatchCost, findShortages, mergeConsumption, suggestConsumption } from '../../domain/production'
import { formatQty, parseQty, UNIT_LABELS } from '../../domain/quantity'
import { ar } from '../../i18n/ar'
import { createBatch } from '../../services/production'

interface Line {
  key: number
  itemId: string
  qty: string
}
let nextKey = 1

function linesFromRecipe(recipe: Recipe | undefined, units: number): Line[] {
  if (!recipe) return [{ key: nextKey++, itemId: '', qty: '' }]
  return suggestConsumption(recipe.components, units > 0 ? units : 0).map((c) => ({
    key: nextKey++,
    itemId: c.itemId,
    qty: units > 0 ? String(c.qty) : '',
  }))
}

export function BatchFormPage() {
  const navigate = useNavigate()
  const items = useLiveQuery(async () => (await db.items.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [])
  const recipes = useLiveQuery(() => db.recipes.toArray(), [])

  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(today())
  const [expiry, setExpiry] = useState('')
  const [extra, setExtra] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ key: nextKey++, itemId: '', qty: '' }])
  /** Once the user edits consumption by hand, stop overwriting it from the recipe */
  const [manual, setManual] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const byId = new Map(items?.map((i) => [i.id, i]))
  const products = items?.filter((i) => i.type === 'finished' && i.active) ?? []
  const materials = items?.filter((i) => i.type !== 'finished' && i.active) ?? []
  const recipe = recipes?.find((r) => r.finishedItemId === productId)
  const units = parseQty(qty) ?? 0

  const refill = (pid: string, u: number) => {
    setLines(linesFromRecipe(recipes?.find((r) => r.finishedItemId === pid), u))
    setManual(false)
  }
  const onProduct = (pid: string) => {
    setProductId(pid)
    refill(pid, units)
  }
  const onQty = (v: string) => {
    setQty(v)
    if (!manual) setLines(linesFromRecipe(recipe, parseQty(v) ?? 0))
  }
  const updateLine = (key: number, patch: Partial<Line>) => {
    setManual(true)
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  const consumption = mergeConsumption(lines.map((l) => ({ itemId: l.itemId, qty: parseQty(l.qty) ?? 0 })))
  const shortages = findShortages(consumption, new Map(materials.map((m) => [m.id, m.qtyOnHand])))
  const shortIds = new Set(shortages.map((s) => s.itemId))
  const extraBaisa = extra ? parseRialToBaisa(extra) : 0
  const cost =
    units > 0
      ? computeBatchCost(
          consumption.map((c) => ({ ...c, unitCostBaisa: byId.get(c.itemId)?.avgCostBaisa ?? 0 })),
          extraBaisa ?? 0,
          units,
        )
      : null

  const save = async () => {
    setError(null)
    if (!productId) return setError('اختر المنتج')
    if (!(units > 0)) return setError('أدخل الكمية المنتجة')
    if (lines.some((l) => (l.itemId || l.qty) && (!l.itemId || parseQty(l.qty) == null))) return setError('أكمل بيانات كل مادة')
    if (extraBaisa == null) return setError('التكاليف الإضافية غير صحيحة')
    setSaving(true)
    try {
      const id = await createBatch(db, {
        finishedItemId: productId,
        recipeId: recipe?.id,
        date,
        qtyProduced: units,
        consumed: consumption,
        extraCostBaisa: extraBaisa,
        expiryDate: expiry || undefined,
        notes,
      })
      navigate(`/production/${id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const options = (type: Item['type']) =>
    materials.filter((m) => m.type === type).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)

  return (
    <>
      <PageHeader title="دفعة إنتاج جديدة" back={{ to: '/production', label: ar.nav.production }} />
      <div className="flex flex-col gap-5">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="المنتج" className="sm:col-span-2">
              <Select value={productId} onChange={(e) => onProduct(e.target.value)}>
                <option value="">اختر المنتج…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="الكمية المنتجة">
              <NumberInput value={qty} onChange={(e) => onQty(e.target.value)} suffix="عبوة" />
            </Field>
            <Field label="تاريخ الإنتاج">
              <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="تاريخ الانتهاء (اختياري)">
              <DateInput value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </Field>
            <Field label="تكاليف مباشرة إضافية (اختياري)" hint="مثل غاز التشغيل — الرواتب لا تُحسب هنا">
              <NumberInput value={extra} onChange={(e) => setExtra(e.target.value)} suffix="ر.ع" placeholder="0.000" />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">المواد المستهلكة</h2>
            {recipe && (
              <Button variant="ghost" onClick={() => refill(productId, units)}>
                <RotateCcw className="size-4" /> إعادة الحساب من الوصفة
              </Button>
            )}
          </div>
          {productId && !recipe && (
            <p className="mb-3 text-sm text-amber-800">لا توجد وصفة لهذا المنتج — أدخل المواد يدوياً.</p>
          )}
          {recipe?.isEstimate && (
            <p className="mb-3 text-sm text-amber-800">الكميات مقترحة من وصفة تقديرية — عدّلها للاستهلاك الفعلي.</p>
          )}
          <div className="flex flex-col gap-3">
            {lines.map((l) => {
              const item = byId.get(l.itemId)
              const q = parseQty(l.qty) ?? 0
              const short = shortIds.has(l.itemId)
              return (
                <div
                  key={l.key}
                  className={`grid grid-cols-2 items-end gap-3 rounded-2xl p-3 sm:grid-cols-[10rem_1fr_auto] lg:grid-cols-[1fr_9rem_9rem_auto] ${short ? 'bg-red-50 ring-1 ring-red-200' : 'bg-stone-50'}`}
                >
                  <Field label="المادة" className="col-span-2 sm:col-span-3 lg:col-span-1">
                    <Select value={l.itemId} onChange={(e) => updateLine(l.key, { itemId: e.target.value })}>
                      <option value="">اختر…</option>
                      <optgroup label={ar.itemTypes.raw}>{options('raw')}</optgroup>
                      <optgroup label={ar.itemTypes.packaging}>{options('packaging')}</optgroup>
                    </Select>
                  </Field>
                  <Field label="الكمية">
                    <NumberInput value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} suffix={item ? UNIT_LABELS[item.unit] : undefined} />
                  </Field>
                  <div className="flex min-h-12 flex-col justify-center text-sm">
                    {item && (
                      <>
                        <span className={short ? 'font-bold text-red-700' : 'text-stone-500'}>
                          المتوفر: <span className="num">{formatQty(item.qtyOnHand, item.unit)}</span>
                        </span>
                        <span className="num text-stone-500">{formatOMR(lineTotal(q, item.avgCostBaisa))}</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setManual(true)
                      setLines((ls) => ls.filter((x) => x.key !== l.key))
                    }}
                    className="col-start-2 flex size-12 items-center justify-center justify-self-end rounded-xl text-stone-400 hover:bg-red-100 hover:text-red-600 sm:col-start-auto"
                    aria-label="حذف المادة"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              )
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="mt-3"
            onClick={() => {
              setManual(true)
              setLines((ls) => [...ls, { key: nextKey++, itemId: '', qty: '' }])
            }}
          >
            <Plus className="size-5" /> إضافة مادة
          </Button>
          {shortages.length > 0 && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              لا يمكن الحفظ: المواد المظللة بالأحمر غير كافية. سجّل شراءها أولاً أو قلّل الكمية.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">التكلفة</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-stone-500">تكلفة المواد</dt>
            <dd className="num font-medium">{formatOMR(cost?.materialsCostBaisa ?? 0)}</dd>
            <dt className="text-stone-500">تكاليف إضافية</dt>
            <dd className="num font-medium">{formatOMR(cost?.extraCostBaisa ?? 0)}</dd>
            <dt className="text-stone-500">إجمالي الدفعة</dt>
            <dd className="num font-medium">{formatOMR(cost?.totalCostBaisa ?? 0)}</dd>
            <dt className="font-bold">تكلفة العبوة</dt>
            <dd className="num text-lg font-bold text-brand-800">{cost ? formatOMR(Math.round(cost.unitCostBaisa)) : '—'}</dd>
          </dl>
          <Field label="ملاحظات" className="mt-4">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        <FormError message={error} />
        <div className="flex gap-2">
          <Button className="flex-1 sm:min-w-48 sm:flex-none" onClick={save} disabled={saving || shortages.length > 0}>
            حفظ الدفعة
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
        </div>
      </div>
    </>
  )
}
