import { getLang, t } from '../../i18n/index'
import { Check, HardDrive, ImageUp, Languages, RotateCcw } from 'lucide-react'
import { setLanguage } from '../../app/language'
import { useEffect, useRef, useState } from 'react'
import { usePersistentStorage } from '../../app/storage'
import { useSettings } from '../../app/useSettings'
import { Field, FormError, NumberInput, Segmented, TextInput } from '../../components/form'
import { errorMessage } from '../../components/format'
import { Button, Card, PageHeader } from '../../components/ui'
import { BackupCard } from '../backup/BackupCard'
import { db } from '../../db/db'
import { ar } from '../../i18n/ar'
import { updateSettings } from '../../services/settings'
import { LOGO_URL } from '../../app/assets'

/** Scales an uploaded image down so it stays small inside the database. */
async function imageToDataUrl(file: File, maxSide = 600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function SettingsPage() {
  const settings = useSettings()
  const persist = usePersistentStorage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ businessName: '', businessPhone: '', commercialRegNo: '', businessAddress: '', businessAddressEn: '', vat: '0', dueDays: '15', validityDays: '14' })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings) return
    setForm({
      businessName: settings.businessName,
      businessPhone: settings.businessPhone ?? '',
      commercialRegNo: settings.commercialRegNo ?? '',
      businessAddress: settings.businessAddress ?? '',
      businessAddressEn: settings.businessAddressEn ?? '',
      vat: String(settings.vatRatePercent),
      dueDays: String(settings.invoiceDueDays),
      validityDays: String(settings.quoteValidityDays),
    })
  }, [settings?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setSaved(false)
    setForm({ ...form, [k]: e.target.value })
  }

  const save = async () => {
    setError(null)
    const vat = Number(form.vat)
    const due = parseInt(form.dueDays, 10)
    const validity = parseInt(form.validityDays, 10)
    if (!Number.isFinite(vat)) return setError(t("نسبة الضريبة غير صحيحة", "Invalid VAT rate"))
    if (!(due >= 0) || !(validity >= 0)) return setError(t("عدد الأيام غير صحيح", "Invalid number of days"))
    try {
      await updateSettings(db, {
        businessName: form.businessName.trim(),
        businessPhone: form.businessPhone.trim(),
        commercialRegNo: form.commercialRegNo.trim(),
        businessAddress: form.businessAddress.trim(),
        businessAddressEn: form.businessAddressEn.trim(),
        vatRatePercent: vat,
        invoiceDueDays: due,
        quoteValidityDays: validity,
      })
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const uploadLogo = async (file?: File) => {
    if (!file) return
    try {
      await updateSettings(db, { logoDataUrl: await imageToDataUrl(file) })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      <PageHeader title={ar.nav.settings} />
      <Card className="mb-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
          <Languages className="size-5" /> {t("اللغة", "Language")} <span className="text-sm font-normal text-stone-500">Language / اللغة</span>
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-sm font-medium text-stone-700">{t("لغة التطبيق", "App language")}</div>
            <Segmented
              value={getLang()}
              onChange={(l) => setLanguage(l)}
              options={[
                { value: 'ar', label: 'العربية' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium text-stone-700">{t("اللغة الافتراضية للفواتير وعروض الأسعار", "Default language for invoices & quotations")}</div>
            <Segmented
              value={settings?.docLanguage ?? 'ar'}
              onChange={(l) => updateSettings(db, { docLanguage: l })}
              options={[
                { value: 'ar', label: 'العربية' },
                { value: 'en', label: 'English' },
                { value: 'both', label: 'عربي + English' },
              ]}
            />
          </div>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg font-bold">{ar.settings.business}</h2>
          <p className="mb-4 text-sm text-stone-500">{t("تظهر هذه البيانات في رأس الفواتير وعروض الأسعار.", "These details appear in the header of invoices and quotations.")}</p>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-24 items-center justify-center rounded-2xl border border-stone-200 bg-white p-2">
                <img src={settings?.logoDataUrl || LOGO_URL} alt={t("الشعار", "Logo")} className="max-h-full max-w-full" />
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <ImageUp className="size-4" /> {t("تغيير الشعار", "Change logo")}
                </Button>
                {settings?.logoDataUrl && (
                  <Button variant="ghost" onClick={() => updateSettings(db, { logoDataUrl: undefined })}>
                    <RotateCcw className="size-4" /> {t("الشعار الأصلي", "Original logo")}
                  </Button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </div>
            <Field label={ar.settings.businessName}>
              <TextInput value={form.businessName} onChange={set('businessName')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("الهاتف", "Phone")}>
                <TextInput value={form.businessPhone} onChange={set('businessPhone')} inputMode="tel" dir="ltr" className="rtl:text-right" />
              </Field>
              <Field label={t("السجل التجاري (س.ت)", "Commercial registration (CR)")}>
                <TextInput value={form.commercialRegNo} onChange={set('commercialRegNo')} inputMode="numeric" dir="ltr" className="rtl:text-right" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("العنوان", "Address")}>
              <TextInput value={form.businessAddress} onChange={set('businessAddress')} dir="rtl" />
            </Field>
              <Field label={t("العنوان بالإنجليزية", "Address (English)")}>
                <TextInput value={form.businessAddressEn} onChange={set('businessAddressEn')} dir="ltr" placeholder="Bawshar" />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">{t("الفواتير وعروض الأسعار", "Invoices and quotations")}</h2>
          <div className="flex flex-col gap-4">
            <Field label={ar.settings.vat} hint={ar.settings.vatNote}>
              <NumberInput value={form.vat} onChange={set('vat')} suffix="%" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("مدة استحقاق الفاتورة", "Invoice due period")}>
                <NumberInput value={form.dueDays} onChange={set('dueDays')} suffix={t("يوم", "days")} inputMode="numeric" />
              </Field>
              <Field label={t("صلاحية عرض السعر", "Quotation validity")}>
                <NumberInput value={form.validityDays} onChange={set('validityDays')} suffix={t("يوم", "days")} inputMode="numeric" />
              </Field>
            </div>
            <p className="text-sm text-stone-500">
              {ar.settings.currency}: {ar.settings.currencyValue}
            </p>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={save} className="min-w-40">{t("حفظ الإعدادات", "Save settings")}</Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <Check className="size-4" /> {t("تم الحفظ", "Saved")}
          </span>
        )}
      </div>
      <div className="mt-3"><FormError message={error} /></div>

      <Card className="mt-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
          <HardDrive className="size-5" /> {ar.storage.title}
        </h2>
        <p className="text-sm">
          {persist === 'persisted' && ar.storage.persisted}
          {persist === 'not-persisted' && ar.storage.notPersisted}
          {persist === 'unknown' && ar.storage.unknown}
        </p>
      </Card>
      <BackupCard />
    </>
  )
}
