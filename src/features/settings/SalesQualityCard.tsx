import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Field, FormError, NumberInput } from '../../components/form'
import { Button, Card } from '../../components/ui'
import { serverError } from '../../data/errors'
import { type Settings, updateSettings } from '../../data/settings'
import { normalizeDigits } from '../../domain/money'
import { t } from '../../i18n/index'
import { SectionTitle } from './SectionTitle'

const KEYS = ['invoiceDueDays', 'quoteValidityDays', 'maxMoisturePct', 'maxAflatoxinPpb'] as const
type Key = (typeof KEYS)[number]

/** Payment terms, quotation validity, and the lab limits the owner's specification sets. */
export function SalesQualityCard({ settings }: { settings: Settings }) {
  const pick = (s: Settings) => Object.fromEntries(KEYS.map((k) => [k, s[k] == null ? '' : String(Number(s[k]))])) as Record<Key, string>
  const [form, setForm] = useState(() => pick(settings))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setForm(pick(settings)), [settings.updatedAt])

  const dirty = KEYS.some((k) => form[k] !== pick(settings)[k])
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const save = async () => {
    const n = (s: string) => (normalizeDigits(s) === '' ? null : Number(normalizeDigits(s)))
    const due = n(form.invoiceDueDays)
    const valid = n(form.quoteValidityDays)
    const moisture = n(form.maxMoisturePct)
    const aflatoxin = n(form.maxAflatoxinPpb)
    if (due == null || !Number.isInteger(due) || due < 0) return setError(t('مدة السداد يجب أن تكون عدد أيام صحيحاً.', 'Payment terms must be a whole number of days.'))
    if (valid == null || !Number.isInteger(valid) || valid < 0) return setError(t('صلاحية العرض يجب أن تكون عدد أيام صحيحاً.', 'Quotation validity must be a whole number of days.'))
    if ([moisture, aflatoxin].some((v) => v != null && !(v >= 0))) return setError(t('حدود الجودة غير صحيحة.', 'Invalid quality limits.'))
    setSaving(true)
    setError(null)
    try {
      await updateSettings({
        invoiceDueDays: due,
        quoteValidityDays: valid,
        maxMoisturePct: moisture == null ? null : String(moisture),
        maxAflatoxinPpb: aflatoxin == null ? null : String(aflatoxin),
      })
      setSaved(true)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionTitle note={t('حدود الجودة من المواصفة المعتمدة لديكم؛ أي فحص يتجاوزها يظهر باللون الأحمر.', 'Quality limits come from your approved specification; any check above them shows in red.')}>
        {t('المبيعات والجودة', 'Sales & quality')}
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('مدة السداد للفاتورة', 'Invoice payment terms')}>
          <NumberInput value={form.invoiceDueDays} onChange={set('invoiceDueDays')} suffix={t('يوماً', 'days')} />
        </Field>
        <Field label={t('صلاحية عرض السعر', 'Quotation valid for')}>
          <NumberInput value={form.quoteValidityDays} onChange={set('quoteValidityDays')} suffix={t('يوماً', 'days')} />
        </Field>
        <Field label={t('الحد الأقصى للرطوبة', 'Maximum moisture')}>
          <NumberInput value={form.maxMoisturePct} onChange={set('maxMoisturePct')} suffix="%" />
        </Field>
        <Field label={t('الحد الأقصى للأفلاتوكسين', 'Maximum aflatoxin')}>
          <NumberInput value={form.maxAflatoxinPpb} onChange={set('maxAflatoxinPpb')} suffix="ppb" />
        </Field>
      </div>
      <FormError message={error} />
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ', 'Save')}
        </Button>
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm text-palm">
            <Check className="size-4" />
            {t('تم الحفظ', 'Saved')}
          </span>
        )}
      </div>
    </Card>
  )
}
