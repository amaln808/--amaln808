import { CalendarPlus, FileUp, Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Select, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { compressImage, signedUrl, uploadFile } from '../../data/files'
import { type Agreement, type AgreementKind, deleteAgreement, type ProductOption, renewAgreement, saveAgreement, todayIso } from '../../data/schedule'
import { buildIcs, type IcsEvent, openIcs } from '../../domain/ics'
import { endAfterMonths } from '../../domain/schedule'
import { nameOf, t } from '../../i18n/index'
import { durationLabel, kindLabel } from '../tasks/labels'

export type AgreementDraft = Omit<Agreement, 'id' | 'renewedById'> & { id?: string }

export function emptyAgreement(over: Partial<AgreementDraft> = {}): AgreementDraft {
  const start = todayIso()
  return {
    kind: 'contract',
    title: '',
    party: null,
    productId: null,
    referenceNo: null,
    startDate: start,
    endDate: endAfterMonths(start, 12),
    alertDays: 30,
    amountBaisa: null,
    filePath: null,
    notes: null,
    active: true,
    ...over,
  }
}

/** Calendar event on the end date, reminding `alertDays` before (8:00) and on the day. */
export function agreementEvent(a: AgreementDraft & { id: string }): IcsEvent {
  return {
    uid: `agreement-${a.id}`,
    title: t(`انتهاء: ${a.title}`, `Expires: ${a.title}`),
    description: [kindLabel(a.kind), a.party, a.referenceNo].filter(Boolean).join('\n'),
    date: a.endDate,
    alarms: [...(a.alertDays > 0 ? [a.alertDays * 1440 - 480] : []), -480],
  }
}

export const agreementIcs = (a: AgreementDraft & { id: string }) => buildIcs([agreementEvent(a)])

const DURATIONS = [6, 12, 24, 36]

function toRial(baisa: number | null) {
  return baisa === null ? '' : (baisa / 1000).toFixed(3)
}
function parseBaisa(text: string): number | null | 'bad' {
  const s = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace('٫', '.').replace(/,/g, '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 'bad'
}

export function AgreementFormModal({
  initial,
  renewingId,
  products,
  onClose,
}: {
  initial: AgreementDraft
  /** When set, saving creates a renewal and retires this agreement */
  renewingId?: string
  products: ProductOption[]
  onClose: () => void
}) {
  const [f, setF] = useState<AgreementDraft>(initial)
  const [amount, setAmount] = useState(toRial(initial.amountBaisa))
  const [alert, setAlert] = useState(String(initial.alertDays))
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()
  const set = <K extends keyof AgreementDraft>(k: K, v: AgreementDraft[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    const amountBaisa = parseBaisa(amount)
    const alertDays = Number(alert)
    if (!f.title.trim()) return setError(t('العنوان مطلوب.', 'The title is required.'))
    if (f.kind === 'product_permit' && !f.productId) return setError(t('اختيار المنتج مطلوب لتصريح البيع.', 'Choose the product for a sale permit.'))
    if (!f.endDate) return setError(t('تاريخ الانتهاء مطلوب.', 'The end date is required.'))
    if (f.startDate && f.endDate < f.startDate) return setError(t('تاريخ الانتهاء قبل البداية.', 'End date is before the start.'))
    if (amountBaisa === 'bad') return setError(t('القيمة غير صحيحة.', 'The amount is not valid.'))
    if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 365) return setError(t('أيام التنبيه من 0 إلى 365.', 'Alert days must be 0–365.'))
    setBusy(true)
    setError(null)
    try {
      let filePath = f.filePath
      if (file) {
        const isPdf = file.type === 'application/pdf'
        const blob = isPdf ? file : await compressImage(file)
        filePath = await uploadFile('documents', `${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`, blob)
      }
      const record = {
        ...f,
        title: f.title.trim(),
        party: f.party?.trim() || null,
        referenceNo: f.referenceNo?.trim() || null,
        notes: f.notes?.trim() || null,
        productId: f.kind === 'product_permit' ? f.productId : null,
        amountBaisa,
        alertDays,
        filePath,
      }
      if (renewingId) {
        const { id: _drop, ...rest } = record
        void _drop
        await renewAgreement(renewingId, rest)
      } else await saveAgreement(record)
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!f.id) return
    const ok = await confirm({
      title: t('حذف', 'Delete'),
      message: t('حذف هذه الاتفاقية نهائياً؟ للاحتفاظ بالسجل يُفضَّل «تجديد» بدلاً من الحذف.', 'Delete this permanently? To keep history, use “Renew” instead.'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteAgreement(f.id)
      onClose()
    } catch (e) {
      setError(serverError(e))
    }
  }

  const viewFile = async () => {
    if (!f.filePath) return
    try {
      window.open(await signedUrl('documents', f.filePath), '_blank')
    } catch (e) {
      setError(serverError(e))
    }
  }

  const duration = f.endDate ? durationLabel(f.startDate, f.endDate) : null

  return (
    <Modal
      open
      onClose={onClose}
      title={renewingId ? t('تجديد', 'Renew') : f.id ? t('تعديل', 'Edit') : t('إضافة اتفاقية أو تصريح', 'Add agreement or permit')}
      footer={
        <>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {f.id && !renewingId && (
            <Button variant="secondary" onClick={() => openIcs(agreementIcs({ ...f, id: f.id! }), 'zawrda-agreement.ics')} aria-label={t('إضافة إلى التقويم', 'Add to Calendar')}>
              <CalendarPlus className="size-5" />
            </Button>
          )}
          {f.id && !renewingId && (
            <Button variant="ghost" onClick={remove} aria-label={t('حذف', 'Delete')} className="text-red-700">
              <Trash2 className="size-5" />
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('النوع', 'Type')}>
          <Select value={f.kind} onChange={(e) => set('kind', e.target.value as AgreementKind)} disabled={!!renewingId}>
            {(['product_permit', 'contract', 'license', 'other'] as AgreementKind[]).map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </Select>
        </Field>
        {f.kind === 'product_permit' && (
          <Field
            label={t('المنتج', 'Product')}
            hint={products.length ? t('لن يُسمح ببيع المنتج إلا بتصريح ساري المفعول.', 'The product can only be sold while a permit is valid.') : t('تُضاف المنتجات في المرحلة 2.', 'Products are added in phase 2.')}
          >
            <Select value={f.productId ?? ''} onChange={(e) => set('productId', e.target.value || null)} disabled={!!renewingId}>
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {nameOf({ name: p.name, nameEn: p.nameEn ?? undefined })}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('العنوان', 'Title')}>
          <TextInput
            value={f.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder={f.kind === 'product_permit' ? t('مثال: تصريح بيع معجون 250 جم', 'e.g. Sale permit — 250 g jar') : t('مثال: عقد إيجار المصنع', 'e.g. Factory lease')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f.kind === 'product_permit' || f.kind === 'license' ? t('الجهة المُصدِرة', 'Issued by') : t('الطرف الآخر', 'Other party')}>
            <TextInput value={f.party ?? ''} onChange={(e) => set('party', e.target.value)} />
          </Field>
          <Field label={t('الرقم المرجعي', 'Reference no.')}>
            <TextInput dir="ltr" value={f.referenceNo ?? ''} onChange={(e) => set('referenceNo', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('تاريخ البداية', 'Start date')}>
            <DateInput value={f.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || null)} />
          </Field>
          <Field label={t('تاريخ الانتهاء', 'End date')} hint={duration ? t(`المدة: ${duration}`, `Length: ${duration}`) : undefined}>
            <DateInput value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
        </div>
        {f.startDate && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">{t('المدة:', 'Length:')}</span>
            {DURATIONS.map((m) => {
              const end = endAfterMonths(f.startDate!, m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('endDate', end)}
                  className={`min-h-11 rounded-full border px-3 text-sm ${f.endDate === end ? 'border-brand-700 bg-brand-700 text-on-brand' : 'border-line'}`}
                >
                  {durationLabel(f.startDate, end)}
                </button>
              )
            })}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('التنبيه قبل الانتهاء', 'Alert before expiry')}>
            <NumberInput value={alert} onChange={(e) => setAlert(e.target.value)} suffix={t('يوم', 'days')} />
          </Field>
          <Field label={t('القيمة (اختياري)', 'Value (optional)')}>
            <NumberInput value={amount} onChange={(e) => setAmount(e.target.value)} suffix={t('ر.ع', 'OMR')} />
          </Field>
        </div>
        <Field label={t('الوثيقة (صورة أو PDF)', 'Document (photo or PDF)')}>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="secondary" onClick={() => input.current?.click()}>
              <FileUp className="size-5" />
              {file ? file.name : f.filePath ? t('استبدال الوثيقة', 'Replace document') : t('إرفاق وثيقة', 'Attach document')}
            </Button>
            {f.filePath && !file && (
              <Button variant="ghost" onClick={viewFile}>
                <Paperclip className="size-5" />
                {t('عرض', 'View')}
              </Button>
            )}
          </div>
        </Field>
        <Field label={t('ملاحظات', 'Notes')}>
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <FormError message={error} />
      </div>
      {dialog}
    </Modal>
  )
}
