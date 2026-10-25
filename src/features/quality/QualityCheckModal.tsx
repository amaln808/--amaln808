import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { DateInput, Field, FormError, NumberInput, Segmented, Textarea, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui'
import { useConfirm } from '../../components/useConfirm'
import { serverError } from '../../data/errors'
import { compressImage, signedUrl, uploadFile } from '../../data/files'
import { type QcResult, type QualityCheck, deleteQualityCheck, saveQualityCheck } from '../../data/quality'
import { todayIso } from '../../data/schedule'
import type { Settings } from '../../data/settings'
import { normalizeDigits } from '../../domain/money'
import { overLimit } from '../../domain/quality'
import { t } from '../../i18n/index'
import { resultLabel } from './labels'

/** Records (or edits) one lab check of a production batch. The latest check decides whether the batch can be sold. */
export function QualityCheckModal({
  batchId,
  batchNo,
  check,
  settings,
  onClose,
}: {
  batchId: string
  batchNo: string
  check?: QualityCheck
  settings: Settings | undefined
  onClose: () => void
}) {
  const [f, setF] = useState({
    checkDate: check?.checkDate ?? todayIso(),
    labName: check?.labName ?? '',
    moisturePct: check?.moisturePct ?? '',
    aflatoxinPpb: check?.aflatoxinPpb ?? '',
    result: check?.result ?? ('pending' as QcResult),
    notes: check?.notes ?? '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const num = (s: string) => {
    const v = normalizeDigits(s)
    return v === '' ? null : v
  }
  const moistureOver = overLimit(f.moisturePct, settings?.maxMoisturePct)
  const aflatoxinOver = overLimit(f.aflatoxinPpb, settings?.maxAflatoxinPpb)

  const save = async () => {
    for (const [v, label] of [[f.moisturePct, t('الرطوبة', 'Moisture')], [f.aflatoxinPpb, t('الأفلاتوكسين', 'Aflatoxin')]] as const) {
      const n = num(v)
      if (n != null && !(Number(n) >= 0)) return setError(t(`قيمة ${label} غير صحيحة.`, `Invalid ${label} value.`))
    }
    setBusy(true)
    setError(null)
    try {
      let certificatePath = check?.certificatePath ?? null
      if (file) {
        const isPdf = file.type === 'application/pdf'
        const blob = isPdf ? file : await compressImage(file)
        certificatePath = await uploadFile('lab-certificates', `${batchId}/${crypto.randomUUID()}.${isPdf ? 'pdf' : 'jpg'}`, blob)
      }
      await saveQualityCheck({
        id: check?.id,
        batchId,
        checkDate: f.checkDate,
        labName: f.labName.trim() || null,
        moisturePct: num(f.moisturePct),
        aflatoxinPpb: num(f.aflatoxinPpb),
        result: f.result,
        certificatePath,
        notes: f.notes.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(serverError(e))
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!check) return
    const ok = await confirm({
      title: t('حذف الفحص', 'Delete check'),
      message: t('تعود حالة الدفعة إلى نتيجة الفحص السابق (أو «بانتظار الفحص»).', 'The batch goes back to the previous result (or «awaiting check»).'),
      confirmLabel: t('حذف', 'Delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteQualityCheck(check.id)
      onClose()
    } catch (e) {
      setError(serverError(e))
    }
  }

  const openCertificate = async () => {
    if (check?.certificatePath) window.open(await signedUrl('lab-certificates', check.certificatePath), '_blank')
  }

  const limitHint = (over: boolean, limit: string | null | undefined, unit: string) =>
    limit ? (
      <span className={over ? 'font-bold text-red-700' : undefined}>
        {over ? t(`أعلى من الحد المسموح (${limit} ${unit})`, `Above the limit (${limit} ${unit})`) : t(`الحد الأقصى ${limit} ${unit}`, `Limit ${limit} ${unit}`)}
      </span>
    ) : (
      t('الحد يُضبط من الإعدادات', 'Set the limit in Settings')
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={t(`فحص جودة — دفعة ${batchNo}`, `Quality check — batch ${batchNo}`)}
      footer={
        <>
          <Button onClick={save} disabled={busy} className="flex-1">
            {busy ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
          </Button>
          {check && (
            <Button variant="ghost" className="text-red-700" onClick={remove} disabled={busy} aria-label={t('حذف', 'Delete')}>
              <Trash2 className="size-5" />
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('تاريخ الفحص', 'Check date')}>
          <DateInput value={f.checkDate} onChange={(e) => set('checkDate', e.target.value)} />
        </Field>
        <Field label={t('المختبر', 'Lab')}>
          <TextInput value={f.labName} onChange={(e) => set('labName', e.target.value)} />
        </Field>
        <Field label={t('الرطوبة', 'Moisture')} hint={limitHint(moistureOver, settings?.maxMoisturePct, '%')}>
          <NumberInput value={f.moisturePct} onChange={(e) => set('moisturePct', e.target.value)} suffix="%" className={moistureOver ? '!border-red-500 text-red-700' : ''} />
        </Field>
        <Field label={t('الأفلاتوكسين', 'Aflatoxin')} hint={limitHint(aflatoxinOver, settings?.maxAflatoxinPpb, 'ppb')}>
          <NumberInput value={f.aflatoxinPpb} onChange={(e) => set('aflatoxinPpb', e.target.value)} suffix="ppb" className={aflatoxinOver ? '!border-red-500 text-red-700' : ''} />
        </Field>
        <Field label={t('النتيجة', 'Result')} className="sm:col-span-2">
          <Segmented<QcResult>
            value={f.result}
            onChange={(v) => set('result', v)}
            options={(['pending', 'pass', 'fail'] as const).map((r) => ({ value: r, label: resultLabel(r) }))}
          />
        </Field>
        {f.result === 'pass' && (moistureOver || aflatoxinOver) && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
            {t('تنبيه: إحدى القيم أعلى من الحد في الإعدادات، والنتيجة «مقبولة». يُرجى التأكد من الشهادة قبل الحفظ.', 'Warning: a value is above the limit in Settings but the result is «pass». Check the certificate before saving.')}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="secondary" onClick={() => input.current?.click()}>
            <Paperclip className="size-5" />
            {file ? file.name : check?.certificatePath ? t('استبدال الشهادة', 'Replace certificate') : t('إرفاق شهادة المختبر', 'Attach lab certificate')}
          </Button>
          {check?.certificatePath && !file && (
            <Button variant="ghost" onClick={openCertificate}>
              <FileText className="size-5" />
              {t('عرض الشهادة', 'View certificate')}
            </Button>
          )}
        </div>
        <Field label={t('ملاحظات', 'Notes')} className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <p className="text-sm text-muted sm:col-span-2">
          {t('آخر فحص يحدد حالة الدفعة: «مقبولة» تسمح ببيعها، و«مرفوضة» أو «قيد الانتظار» تمنع البيع.', 'The latest check decides the batch: «pass» allows selling it; «fail» or «pending» blocks it.')}
        </p>
        <FormError message={error} />
      </div>
      {dialog}
    </Modal>
  )
}
