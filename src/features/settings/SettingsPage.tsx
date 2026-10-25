import { buildLabel } from '../../app/pwaUpdate'
import { Check, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { applyTheme, BRAND_SWATCHES } from '../../app/theme'
import { Field, FormError, Segmented, TextInput } from '../../components/form'
import { useConfirm } from '../../components/useConfirm'
import { Button, Card, PageHeader } from '../../components/ui'
import { useAuth } from '../../data/auth'
import { serverError } from '../../data/errors'
import { type FontScale, type Settings, type ThemeMode, updateSettings } from '../../data/settings'
import { useOutboxCounts } from '../../data/useOnline'
import { t } from '../../i18n/index'
import { BrandingCard } from './BrandingCard'
import { DemoDataCard } from './DemoDataCard'
import { PendingChangesCard } from './PendingChangesCard'
import { SalesSettingsCard } from './SalesSettingsCard'
import { SectionTitle } from './SectionTitle'
import { UsageCard } from './UsageCard'

type CompanyFields = Pick<Settings, 'companyName' | 'companyNameEn' | 'phone' | 'email' | 'crNo' | 'address' | 'addressEn' | 'vatNo'>
const COMPANY_KEYS: (keyof CompanyFields)[] = ['companyName', 'companyNameEn', 'phone', 'email', 'crNo', 'address', 'addressEn', 'vatNo']

function CompanyCard({ settings }: { settings: Settings }) {
  const pick = (s: Settings) => Object.fromEntries(COMPANY_KEYS.map((k) => [k, s[k] ?? ''])) as Record<keyof CompanyFields, string>
  const [form, setForm] = useState(() => pick(settings))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setForm(pick(settings)), [settings.updatedAt]) // reload after a save elsewhere

  const dirty = COMPANY_KEYS.some((k) => (settings[k] ?? '') !== form[k])
  const set = (k: keyof CompanyFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  const save = async () => {
    if (!form.companyName.trim()) return setError(t('اسم المنشأة مطلوب.', 'The business name is required.'))
    setSaving(true)
    setError(null)
    try {
      const patch = Object.fromEntries(COMPANY_KEYS.map((k) => [k, form[k].trim() || null]))
      await updateSettings(patch)
      setSaved(true)
    } catch (e) {
      setError(serverError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <SectionTitle note={t('تظهر في رأس الفواتير وعروض الأسعار.', 'Shown at the top of invoices and quotations.')}>
        {t('بيانات المنشأة', 'Business details')}
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')}>
          <TextInput value={form.companyName} onChange={set('companyName')} />
        </Field>
        <Field label={t('الاسم بالإنجليزية', 'Name in English')}>
          <TextInput dir="ltr" value={form.companyNameEn} onChange={set('companyNameEn')} />
        </Field>
        <Field label={t('الهاتف', 'Phone')}>
          <TextInput dir="ltr" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label={t('البريد الإلكتروني', 'Email')}>
          <TextInput dir="ltr" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('السجل التجاري', 'Commercial registration')}>
          <TextInput dir="ltr" inputMode="numeric" value={form.crNo} onChange={set('crNo')} />
        </Field>
        <Field label={t('الرقم الضريبي', 'VAT number')} hint={t('يُترك فارغاً حتى التسجيل الضريبي.', 'Leave empty until VAT registration.')}>
          <TextInput dir="ltr" value={form.vatNo} onChange={set('vatNo')} />
        </Field>
        <Field label={t('العنوان', 'Address')}>
          <TextInput value={form.address} onChange={set('address')} />
        </Field>
        <Field label={t('العنوان بالإنجليزية', 'Address in English')}>
          <TextInput dir="ltr" value={form.addressEn} onChange={set('addressEn')} />
        </Field>
      </div>
      <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm leading-relaxed">
        <b>{t('ضريبة القيمة المضافة: 0%', 'VAT: 0%')}</b>
        {' — '}
        {t(
          'المنشأة غير مسجّلة ضريبياً، فلا تُضاف ضريبة على الفواتير. بعد التسجيل يُضاف الرقم الضريبي وتُفعَّل الضريبة.',
          'Not VAT-registered, so invoices carry no VAT. After registration the VAT number is added and VAT is turned on.',
        )}
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

function AppearanceCard({ settings }: { settings: Settings }) {
  const [error, setError] = useState<string | null>(null)
  const theme = { primary: settings.themePrimary, mode: settings.themeMode, fontScale: settings.fontScale }

  // Applies at once on this iPad, then saves; if saving fails the look stays until reload
  const change = async (patch: Partial<Pick<Settings, 'themePrimary' | 'themeMode' | 'fontScale'>>) => {
    const next = {
      primary: patch.themePrimary ?? theme.primary,
      mode: patch.themeMode ?? theme.mode,
      fontScale: patch.fontScale ?? theme.fontScale,
    }
    applyTheme(next)
    setError(null)
    try {
      await updateSettings(patch)
    } catch (e) {
      setError(serverError(e))
    }
  }

  const current = theme.primary.toLowerCase()
  return (
    <Card>
      <SectionTitle>{t('المظهر', 'Appearance')}</SectionTitle>
      <div className="flex flex-col gap-6">
        <Field label={t('اللون الأساسي', 'Main colour')}>
          <div className="flex flex-wrap items-center gap-3">
            {BRAND_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => change({ themePrimary: c })}
                className={`size-11 rounded-full ring-offset-2 ring-offset-card transition ${current === c ? 'ring-2 ring-ink' : ''}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={current === c}
              />
            ))}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm">
              <input
                type="color"
                value={theme.primary}
                onChange={(e) => change({ themePrimary: e.target.value })}
                className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
              {t('لون آخر', 'Other colour')}
            </label>
          </div>
        </Field>
        <Field label={t('الوضع', 'Mode')}>
          <Segmented<ThemeMode>
            value={theme.mode}
            onChange={(v) => change({ themeMode: v })}
            options={[
              { value: 'light', label: t('فاتح', 'Light') },
              { value: 'dark', label: t('ليلي', 'Dark') },
              { value: 'system', label: t('حسب الجهاز', 'Device') },
            ]}
          />
        </Field>
        <Field label={t('حجم الخط', 'Text size')}>
          <Segmented<FontScale>
            value={theme.fontScale}
            onChange={(v) => change({ fontScale: v })}
            options={[
              { value: 'sm', label: t('صغير', 'Small') },
              { value: 'md', label: t('عادي', 'Normal') },
              { value: 'lg', label: t('كبير', 'Large') },
              { value: 'xl', label: t('أكبر', 'Larger') },
            ]}
          />
        </Field>
      </div>
      <FormError message={error} />
    </Card>
  )
}

function AccountCard() {
  const { session, signOut } = useAuth()
  const { pending, failed } = useOutboxCounts()
  const { confirm, dialog } = useConfirm()

  const out = async () => {
    const waiting = pending + failed
    const ok = await confirm({
      title: t('تسجيل الخروج', 'Sign out'),
      message: waiting
        ? t(
            `توجد ${waiting} عملية لم تصل للخادم بعد وستُحذف من هذا الجهاز عند الخروج.\nيُفضَّل الاتصال بالإنترنت أولاً حتى تُرسل.`,
            `${waiting} change(s) have not reached the server and will be deleted from this device.\nConnect to the internet first so they are sent.`,
          )
        : t('سيلزم إدخال كلمة المرور للدخول مرة أخرى.', 'You will need your password to sign in again.'),
      confirmLabel: t('خروج', 'Sign out'),
      danger: waiting > 0,
    })
    if (ok) await signOut()
  }

  return (
    <Card>
      <SectionTitle>{t('الحساب', 'Account')}</SectionTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span dir="ltr" className="text-muted">
          {session?.user.email}
        </span>
        <Button variant="secondary" onClick={out}>
          <LogOut className="size-5 ltr:rotate-180" />
          {t('تسجيل الخروج', 'Sign out')}
        </Button>
      </div>
      <p className="mt-4 text-sm text-muted">
        {t('إصدار التطبيق:', 'App version:')} <span dir="ltr" className="num">{buildLabel()}</span>
      </p>
      {dialog}
    </Card>
  )
}

export function SettingsPage() {
  const q = useSettingsQuery()
  const s = q.data
  return (
    <>
      <PageHeader title={t('الإعدادات', 'Settings')} />
      {!s ? (
        <Card>
          {q.error ? <FormError message={serverError(q.error)} /> : <p className="text-muted">{t('جارٍ التحميل…', 'Loading…')}</p>}
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {q.fromCache && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t('غير متصل — تُعرض آخر نسخة محفوظة، والتعديل يحتاج اتصالاً.', 'Offline — showing the last saved copy; changes need a connection.')}
            </p>
          )}
          <PendingChangesCard />
          <CompanyCard settings={s} />
          <BrandingCard settings={s} />
          <SalesSettingsCard settings={s} />
          <AppearanceCard settings={s} />
          <UsageCard />
          <DemoDataCard />
          <AccountCard />
        </div>
      )}
    </>
  )
}
