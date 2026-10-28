import { FileUp, Paperclip, Plus, Trash2, Wrench } from 'lucide-react'
import { useRef, useState } from 'react'
import { Combobox, DateInput, Field, FormError, NumberInput, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button, Card, EmptyState, PageHeader, Stat } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { type Asset, type AssetDraft, ASSETS_KEY, deleteAsset, fetchAssets, saveAsset } from '../../data/assets'
import { serverError } from '../../data/errors'
import { compressImage, signedUrl, uploadFile } from '../../data/files'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { bookValue, currentMonthlyDepreciation, monthlyDepreciation } from '../../domain/depreciation'
import { baisaToInput, formatOMR, normalizeDigits, parseRialToBaisa } from '../../domain/money'
import { distinctNames } from '../../domain/text'
import { t } from '../../i18n/index'
import { formatDate } from '../tasks/labels'

const DEFAULT_CATEGORIES = ['آلات ومعدات', 'تجديد وتركيب', 'تأسيس وتراخيص', 'أثاث وأجهزة']
const LIFE_YEARS = [1, 3, 5, 7, 10]

const yearsText = (months: number) => {
  const y = months / 12
  return Number.isInteger(y) ? t(`${y} ${y === 1 ? 'سنة' : y === 2 ? 'سنتان' : y <= 10 ? 'سنوات' : 'سنة'}`, `${y} yr`) : t(`${months} شهراً`, `${months} months`)
}

function AssetFormModal({ initial, categories, onClose }: { initial: AssetDraft; categories: string[]; onClose: () => void }) {
  const [f, setF] = useState(initial)
  const [cost, setCost] = useState(initial.costBaisa ? baisaToInput(initial.costBaisa) : '')
  const [residual, setResidual] = useState(initial.residualBaisa ? baisaToInput(initial.residualBaisa) : '')
  const [years, setYears] = useState(initial.lifeMonths ? String(+(initial.lifeMonths / 12).toFixed(2)) : '5')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()
  const set = <K extends keyof AssetDraft>(k: K, v: AssetDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const costBaisa = parseRialToBaisa(cost)
  const residualBaisa = residual.trim() ? parseRialToBaisa(residual) : 0
  const lifeMonths = Math.round(Number(normalizeDigits(years)) * 12)
  const preview = costBaisa && residualBaisa != null && lifeMonths > 0 && residualBaisa < costBaisa ? (costBaisa - residualBaisa) / lifeMonths : null

  const save = async () => {
    if (!f.name.trim()) return setError(t('الاسم مطلوب.', 'The name is required.'))
    if (!costBaisa || costBaisa <= 0) return setError(t('التكلفة غير صحيحة.', 'Invalid cost.'))
    if (!(lifeMonths >= 1 && lifeMonths <= 600)) return setError(t('العمر من شهر إلى 50 سنة.', 'Life must be 1 month to 50 years.'))
    if (residualBaisa == null || residualBaisa < 0 || residualBaisa >= costBaisa) return setError(t('القيمة في النهاية يجب أن تكون أقل من التكلفة.', 'The end value must be below the cost.'))
    setBusy(true)
    setError(null)
    try {
      let filePath = f.filePath
      if (file) {
        const isPdf = file.type === 'application/pdf'
        filePath = await uploadFile('documents', `assets/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`, isPdf ? file : await compressImage(file))
      }
      await saveAsset({ ...f, name: f.name.trim(), category: f.category?.trim() || null, notes: f.notes?.trim() || null, costBaisa, residualBaisa, lifeMonths, filePath })
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!f.id) return
    const ok = await confirm({ title: t('حذف', 'Delete'), message: t('يُحذف الأصل نهائياً ويزول إهلاكه من الحسابات.', 'The asset is deleted and its depreciation leaves the figures.'), confirmLabel: t('حذف', 'Delete'), danger: true })
    if (!ok) return
    try {
      await deleteAsset(f.id)
      onClose()
    } catch (e) {
      setError(serverError(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={f.id ? t('تعديل أصل', 'Edit asset') : t('أصل جديد', 'New asset')}
      footer={
        <>
          <Button className="flex-1" onClick={save} disabled={busy}>
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {f.id && (
            <Button variant="ghost" className="text-red-700" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" />
              {t('حذف', 'Delete')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')} className="sm:col-span-2">
          <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={t('مثلاً: آلة التشكيل والتقطيع والتغليف', 'e.g. forming, cutting and wrapping machine')} />
        </Field>
        <Field label={t('النوع', 'Type')}>
          <Combobox value={f.category ?? ''} onChange={(v) => set('category', v)} options={categories.map((label) => ({ label }))} newLabel={t('جديد', 'New')} />
        </Field>
        <Field label={t('تاريخ الشراء أو بدء التشغيل', 'Bought or first used on')}>
          <DateInput value={f.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />
        </Field>
        <Field label={t('التكلفة', 'Cost')} hint={t('شاملة الشحن والتركيب', 'Including shipping and installation')}>
          <NumberInput value={cost} onChange={(e) => setCost(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
        </Field>
        <Field label={t('قيمتها المتوقعة عند البيع في النهاية (اختياري)', 'Expected value when sold at the end (optional)')}>
          <NumberInput value={residual} onChange={(e) => setResidual(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
        </Field>
        <Field label={t('العمر (عدد السنوات التي تُوزَّع عليها التكلفة)', 'Life (years to spread the cost over)')} className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {LIFE_YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(String(y))}
                className={`min-h-11 rounded-xl border px-4 text-sm ${Number(normalizeDigits(years)) === y ? 'border-brand-700 bg-brand-700 font-bold text-on-brand' : 'border-line bg-card'}`}
              >
                {yearsText(y * 12)}
              </button>
            ))}
            <div className="w-28">
              <NumberInput value={years} onChange={(e) => setYears(e.target.value)} suffix={t('سنة', 'yr')} />
            </div>
          </div>
        </Field>
        {preview != null && (
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm sm:col-span-2">
            {t(`الإهلاك الشهري: ${formatOMR(Math.round(preview))} — يُضاف للتكاليف الثابتة كل شهر لمدة ${yearsText(lifeMonths)}.`, `Monthly depreciation: ${formatOMR(Math.round(preview))} — a fixed cost each month for ${yearsText(lifeMonths)}.`)}
          </p>
        )}
        <Field label={t('فاتورة الشراء (صورة أو PDF، اختياري)', 'Purchase invoice (photo or PDF, optional)')} className="sm:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="secondary" onClick={() => input.current?.click()}>
              <FileUp className="size-4" />
              {file ? file.name : f.filePath ? t('استبدال الملف', 'Replace file') : t('إرفاق ملف', 'Attach file')}
            </Button>
            {f.filePath && !file && (
              <Button variant="ghost" onClick={async () => window.open(await signedUrl('documents', f.filePath!), '_blank')}>
                <Paperclip className="size-4" />
                {t('عرض الملف', 'View file')}
              </Button>
            )}
          </div>
        </Field>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
      <FormError message={error} />
      {dialog}
    </Modal>
  )
}

const emptyAsset = (): AssetDraft => ({ name: '', category: null, purchaseDate: todayIso(), costBaisa: 0, lifeMonths: 60, residualBaisa: 0, filePath: null, notes: null, active: true })

/**
 * Machines, fit-out and set-up costs. Each is spread over its useful life, and
 * the monthly share counts as a fixed cost in the dashboard and pricing.
 */
export function AssetsPage() {
  const q = useQuery(ASSETS_KEY, fetchAssets)
  const [editing, setEditing] = useState<AssetDraft | null>(null)
  const today = todayIso()
  const assets = q.data ?? []
  const invested = assets.reduce((s, a) => s + a.costBaisa, 0)
  const monthly = currentMonthlyDepreciation(assets, today)
  const book = assets.reduce((s, a) => s + bookValue(a, today).bookValueBaisa, 0)
  const categories = distinctNames([...DEFAULT_CATEGORIES, ...assets.map((a) => a.category ?? '')].filter(Boolean))

  const row = (a: Asset) => {
    const b = bookValue(a, today)
    return (
      <li key={a.id}>
        <button type="button" onClick={() => setEditing(a)} className="flex w-full flex-col gap-2 px-5 py-4 text-start hover:bg-brand-50">
          <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="min-w-0 flex-1 font-bold">{a.name}</span>
            <span className="num font-bold">{formatOMR(a.costBaisa)}</span>
          </div>
          <div className="flex w-full flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {a.category && <span>{a.category}</span>}
            <span>{t(`منذ ${formatDate(a.purchaseDate)}`, `Since ${formatDate(a.purchaseDate)}`)}</span>
            <span>{t(`على ${yearsText(a.lifeMonths)}`, `Over ${yearsText(a.lifeMonths)}`)}</span>
            <span className="num">{t(`${formatOMR(Math.round(monthlyDepreciation(a)))} شهرياً`, `${formatOMR(Math.round(monthlyDepreciation(a)))} a month`)}</span>
          </div>
          <div className="w-full">
            <div className="h-1.5 overflow-hidden rounded-full bg-ground">
              <div className="h-full rounded-full bg-brand-700" style={{ width: `${(b.monthsDone / a.lifeMonths) * 100}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted">
              {b.finished
                ? t('اكتمل توزيع تكلفته', 'Fully depreciated')
                : t(`وُزّع ${formatOMR(b.accumulatedBaisa)} — المتبقي ${formatOMR(b.bookValueBaisa)}`, `${formatOMR(b.accumulatedBaisa)} spread — ${formatOMR(b.bookValueBaisa)} left`)}
            </div>
          </div>
        </button>
      </li>
    )
  }

  return (
    <>
      <PageHeader
        title={t('الأصول والمعدات', 'Assets & equipment')}
        subtitle={t('الآلات والتجهيز ومصاريف التأسيس: تُوزَّع تكلفتها على سنوات عمرها، والجزء الشهري (الإهلاك) يُحسب تكلفة ثابتة.', 'Machines, fit-out and set-up costs: each is spread over its life; the monthly share (depreciation) is a fixed cost.')}
        actions={
          <Button onClick={() => setEditing(emptyAsset())}>
            <Plus className="size-5" />
            {t('أصل جديد', 'New asset')}
          </Button>
        }
      />
      {q.error && !q.data && <FormError message={serverError(q.error)} />}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t('مجموع ما استُثمر', 'Total invested')} value={formatOMR(invested)} />
        <Stat label={t('الإهلاك الشهري الآن', 'Depreciation this month')} value={formatOMR(monthly)} />
        <Stat label={t('القيمة المتبقية', 'Value left on the books')} value={formatOMR(book)} />
      </div>
      <Card className="p-0">
        {!assets.length ? (
          <EmptyState
            icon={Wrench}
            title={q.loading ? t('جارٍ التحميل…', 'Loading…') : t('لا توجد أصول بعد', 'No assets yet')}
            description={t('يُرجى إضافة كل آلة، والتجديد والتركيب، ومصاريف السجل والتراخيص، كلٌّ بتكلفته وعمره.', 'Add each machine, the fit-out, and the registration costs, each with its cost and life.')}
          />
        ) : (
          <ul className="divide-y divide-line">{assets.map(row)}</ul>
        )}
      </Card>
      {editing && <AssetFormModal initial={editing} categories={categories} onClose={() => setEditing(null)} />}
    </>
  )
}
