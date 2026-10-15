import { t } from '../i18n/index'
import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { isBackupOverdue } from './storage'
import { useSettings } from './useSettings'

const KEY = 'backupReminderDismissed'

/** Weekly nudge to export a backup, shown only once there is real data to lose. */
export function BackupReminder() {
  const settings = useSettings()
  const hasData = useLiveQuery(
    async () => (await db.salesInvoices.count()) + (await db.purchases.count()) + (await db.expenses.count()) + (await db.productionBatches.count()) > 0,
    [],
  )
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  if (!settings || !hasData || dismissed || !isBackupOverdue(settings.lastBackupAt)) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* private mode */
    }
  }

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <DatabaseBackup className="size-5 shrink-0" />
      <p className="flex-1">
        {settings.lastBackupAt ? t("مرّ أكثر من أسبوع على آخر نسخة احتياطية.", "It has been over a week since your last backup.") : t("لم تُصدِّر أي نسخة احتياطية بعد.", "You haven't exported a backup yet.")}{' '}
        <Link to="/settings" className="font-bold underline underline-offset-4">{t("صدّر نسخة الآن", "Export a backup now")}</Link>
      </p>
      <button onClick={dismiss} className="flex size-10 items-center justify-center rounded-full hover:bg-sky-100" aria-label={t("إخفاء التذكير", "Hide reminder")}>
        <X className="size-4" />
      </button>
    </div>
  )
}
