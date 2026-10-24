import { CloudOff, CloudUpload, TriangleAlert } from 'lucide-react'
import { useOnline, useOutboxCounts } from '../data/useOnline'
import { t } from '../i18n/index'

/**
 * Quiet when everything is synced; otherwise says plainly what is going on:
 * offline, changes waiting to be sent, or a change the server refused.
 */
export function ConnectionBadge({ className = '' }: { className?: string }) {
  const online = useOnline()
  const { pending, failed } = useOutboxCounts()

  if (failed) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 ${className}`}>
        <TriangleAlert className="size-3.5" />
        {t(`${failed} عملية لم تُحفظ — يرجى مراجعة الإعدادات`, `${failed} change(s) not saved — see Settings`)}
      </span>
    )
  }
  if (!online) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 ${className}`}>
        <CloudOff className="size-3.5" />
        {pending
          ? t(`غير متصل · ${pending} بانتظار الإرسال`, `Offline · ${pending} waiting`)
          : t('غير متصل — عرض فقط', 'Offline — view only')}
      </span>
    )
  }
  if (pending) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800 ${className}`}>
        <CloudUpload className="size-3.5" />
        {t(`جارٍ إرسال ${pending}…`, `Sending ${pending}…`)}
      </span>
    )
  }
  return null
}
