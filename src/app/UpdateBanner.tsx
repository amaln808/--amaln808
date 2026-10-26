import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { t } from '../i18n/index'
import { forceUpdate, useNewVersion } from './pwaUpdate'

/** Shown on every page when a newer version is published; one tap loads it. */
export function UpdateBanner() {
  const newer = useNewVersion()
  const [busy, setBusy] = useState(false)
  if (!newer) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm">
      <RefreshCw className="size-5 shrink-0 text-brand-800" />
      <p className="flex-1">{t('يوجد إصدار أحدث من التطبيق.', 'A newer version of the app is available.')}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => (setBusy(true), forceUpdate())}
        className="min-h-11 rounded-xl bg-brand-700 px-4 font-bold text-on-brand"
      >
        {busy ? t('جارٍ التحديث…', 'Updating…') : t('تحديث الآن', 'Update now')}
      </button>
    </div>
  )
}
