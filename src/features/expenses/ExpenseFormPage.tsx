import { Camera, Copy, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Combobox, DateInput, Field, FormError, NumberInput, Select, Textarea } from '../../components/form'
import { Button, Card, PageHeader } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { deleteExpense, EXPENSES_KEY, fetchExpenses, saveExpense } from '../../data/expenses'
import { compressImage } from '../../data/files'
import type { PaymentMethod } from '../../data/inventory'
import { todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { useSignedUrl } from '../../data/useSignedUrl'
import { baisaToInput, parseRialToBaisa } from '../../domain/money'
import { guessReceipt } from '../../domain/receipt'
import { distinctNames, nameKey } from '../../domain/text'
import { nameOf, t } from '../../i18n/index'
import { METHODS, methodLabel } from '../inventory/labels'
import { readReceipt } from './ocr'

type Suggested = { date?: boolean; amount?: boolean }

/**
 * Quick expense form. «تصوير فاتورة» reads the photo on the iPad and suggests the
 * date and total (highlighted); nothing is saved or uploaded until «موافقة».
 */
export function ExpenseFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const q = useQuery(EXPENSES_KEY, fetchExpenses)
  const existing = id ? q.data?.expenses.find((e) => e.id === id) : undefined
  const existingPhoto = useSignedUrl('receipts', existing?.receiptPath)
  const { confirm, dialog } = useConfirm()

  const [date, setDate] = useState(todayIso())
  const [supplier, setSupplier] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [vat, setVat] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [ocrText, setOcrText] = useState<string | null>(null)
  const [reading, setReading] = useState<number | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<Suggested>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const camera = useRef<HTMLInputElement>(null)

  const data = q.data
  const catName = (cid: string | null | undefined) => nameOf(data?.categories.find((c) => c.id === cid))
  const supplierName = (sid: string | null | undefined) => data?.suppliers.find((s) => s.id === sid)?.name ?? ''

  // Editing: fill the form once
  useEffect(() => {
    if (loaded || !existing || !data) return
    setDate(existing.date)
    setSupplier(supplierName(existing.supplierId))
    setCategory(catName(existing.categoryId))
    setAmount(baisaToInput(existing.amountBaisa))
    setVat(existing.vatBaisa ? baisaToInput(existing.vatBaisa) : '')
    setMethod(existing.method)
    setNotes(existing.notes ?? '')
    setLoaded(true)
  }, [existing, data, loaded])

  useEffect(() => () => void (photoUrl && URL.revokeObjectURL(photoUrl)), [photoUrl])

  // Picking a known supplier fills the category of its last expense
  const pickSupplier = (v: string) => {
    setSupplier(v)
    const s = data?.suppliers.find((x) => nameKey(x.name) === nameKey(v))
    if (s?.lastCategoryId && !category.trim()) setCategory(catName(s.lastCategoryId))
  }

  const takePhoto = async (file: File | undefined) => {
    if (!file) return
    setReadError(null)
    const small = await compressImage(file)
    setPhoto(small)
    setPhotoUrl(URL.createObjectURL(small))
    setReading(0)
    try {
      const text = await readReceipt(small, (p) => setReading(p))
      setOcrText(text)
      const g = guessReceipt(text, todayIso())
      const s: Suggested = {}
      if (g.date) {
        setDate(g.date)
        s.date = true
      }
      if (g.amountBaisa) {
        setAmount(baisaToInput(g.amountBaisa))
        s.amount = true
      }
      setSuggested(s)
      if (!g.date && !g.amountBaisa) setReadError(t('لم يُقرأ التاريخ ولا المبلغ — يُرجى كتابتهما من الصورة.', 'Could not read the date or amount — type them from the photo.'))
    } catch {
      setReadError(t('تعذرت قراءة الصورة (القارئ يحتاج إنترنت أول مرة). يُرجى كتابة البيانات من الصورة.', 'Could not read the photo (the reader needs internet the first time). Type the details from the photo.'))
    } finally {
      setReading(null)
    }
  }

  const save = async (asNew = false) => {
    setError(null)
    const a = parseRialToBaisa(amount)
    const v = vat.trim() ? parseRialToBaisa(vat) : 0
    if (!category.trim()) return setError(t('التصنيف مطلوب.', 'The category is required.'))
    if (!a || a <= 0) return setError(t('المبلغ غير صحيح.', 'Invalid amount.'))
    if (v == null || v < 0 || v > a) return setError(t('الضريبة غير صحيحة.', 'Invalid VAT.'))
    setBusy(true)
    try {
      await saveExpense(
        {
          date,
          supplierName: supplier,
          categoryName: category.trim(),
          amountBaisa: a,
          vatBaisa: v,
          method,
          notes: notes.trim() || null,
          ocrText,
          receiptPath: asNew ? null : (existing?.receiptPath ?? null),
        },
        { id: asNew ? undefined : existing?.id, photo: photo ?? undefined },
      )
      navigate('/expenses', { replace: true })
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!existing) return
    const ok = await confirm({ title: t('حذف المصروف', 'Delete expense'), message: t('يُحذف المصروف نهائياً.', 'The expense is deleted for good.'), confirmLabel: t('حذف', 'Delete'), danger: true })
    if (!ok) return
    try {
      await deleteExpense(existing.id)
      navigate('/expenses', { replace: true })
    } catch (e) {
      setError(serverError(e))
    }
  }

  const shown = photoUrl ?? existingPhoto
  const hl = (on?: boolean) => (on ? '!border-amber-400 !bg-amber-50 ring-2 ring-amber-200' : '')
  const supplierOptions = (data?.suppliers ?? []).filter((s) => s.active).map((s) => ({ label: s.name, hint: catName(s.lastCategoryId) || undefined }))
  const categoryOptions = distinctNames((data?.categories ?? []).map((c) => nameOf(c))).map((label) => ({ label }))

  return (
    <>
      <PageHeader
        title={existing ? t('تعديل مصروف', 'Edit expense') : t('مصروف جديد', 'New expense')}
        back={{ to: '/expenses', label: t('المصروفات', 'Expenses') }}
        actions={
          existing && (
            <Button variant="secondary" className="!border-red-300 !text-red-700" onClick={remove}>
              <Trash2 className="size-4" />
              {t('حذف', 'Delete')}
            </Button>
          )
        }
      />
      <div className={`grid gap-5 ${shown ? 'md:grid-cols-2' : ''}`}>
        {shown && (
          <Card className="p-2 md:sticky md:top-4 md:self-start">
            <img src={shown} alt={t('صورة الفاتورة', 'Receipt photo')} className="max-h-[75vh] w-full rounded-xl object-contain" />
            {reading != null && (
              <div className="mt-2 px-2 pb-1">
                <div className="mb-1 flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" />
                  {t('جارٍ قراءة الفاتورة على الجهاز…', 'Reading the receipt on this device…')}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full bg-brand-700 transition-all" style={{ width: `${Math.round(reading * 100)}%` }} />
                </div>
              </div>
            )}
          </Card>
        )}

        <div className="flex flex-col gap-5">
          <Card>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => takePhoto(e.target.files?.[0])} />
            <Button variant="secondary" className="mb-4 w-full" onClick={() => camera.current?.click()} disabled={reading != null}>
              <Camera className="size-5" />
              {shown ? t('إعادة تصوير الفاتورة', 'Retake the receipt photo') : t('تصوير فاتورة', 'Photograph a receipt')}
            </Button>
            {(suggested.date || suggested.amount) && (
              <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('الخانات المظللة اقتراح من قراءة الصورة — يُرجى مراجعتها مع الصورة قبل الموافقة.', 'Highlighted boxes were read from the photo — check them against it before approving.')}
              </p>
            )}
            {readError && <p className="mb-4 rounded-xl bg-stone-100 px-4 py-3 text-sm">{readError}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('التاريخ', 'Date')}>
                <DateInput value={date} onChange={(e) => (setDate(e.target.value), setSuggested((s) => ({ ...s, date: false })))} className={hl(suggested.date)} />
              </Field>
              <Field label={t('المبلغ الإجمالي', 'Total amount')} hint={t('شامل الضريبة إن وُجدت', 'Including any VAT')}>
                <NumberInput
                  value={amount}
                  onChange={(e) => (setAmount(e.target.value), setSuggested((s) => ({ ...s, amount: false })))}
                  suffix={t('ر.ع', 'OMR')}
                  placeholder="0.000"
                  className={hl(suggested.amount)}
                />
              </Field>
              <Field label={t('المورد (اختياري)', 'Supplier (optional)')} hint={t('اختيار مورد سابق يعبئ تصنيفه', 'A known supplier fills its category')}>
                <Combobox value={supplier} onChange={pickSupplier} options={supplierOptions} newLabel={t('جديد', 'New')} />
              </Field>
              <Field label={t('التصنيف', 'Category')}>
                <Combobox value={category} onChange={setCategory} options={categoryOptions} newLabel={t('جديد', 'New')} />
              </Field>
              <Field label={t('الضريبة المدفوعة (اختياري)', 'VAT paid (optional)')}>
                <NumberInput value={vat} onChange={(e) => setVat(e.target.value)} suffix={t('ر.ع', 'OMR')} placeholder="0.000" />
              </Field>
              <Field label={t('طريقة الدفع', 'Method')}>
                <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
          </Card>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1 sm:min-w-48 sm:flex-none" onClick={() => save()} disabled={busy || reading != null}>
              {busy ? t('جارٍ الحفظ…', 'Saving…') : shown && !existing ? t('موافقة وحفظ', 'Approve and save') : t('حفظ', 'Save')}
            </Button>
            {existing && (
              <Button variant="secondary" onClick={() => save(true)} disabled={busy}>
                <Copy className="size-4" />
                {t('حفظ كمصروف جديد', 'Save as a new expense')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate(-1)}>
              {t('إلغاء', 'Cancel')}
            </Button>
          </div>
          {photo && <p className="text-sm text-muted">{t('الصورة لا تُرفع إلا بعد الحفظ.', 'The photo is uploaded only when you save.')}</p>}
        </div>
      </div>
      {dialog}
    </>
  )
}
