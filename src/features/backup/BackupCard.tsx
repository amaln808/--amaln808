import { CheckCircle2, DatabaseBackup, Download, FileUp, Loader2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSettingsQuery } from '../../app/settingsContext'
import { isBackupOverdue } from '../../app/storage'
import { Field, FormError, TextInput } from '../../components/form'
import { Modal } from '../../components/Modal'
import { Badge, Button, Card } from '../../components/ui'
import { exportBackup, markBackedUp, restoreBackup } from '../../data/backup'
import { serverError } from '../../data/errors'
import { todayIso } from '../../data/schedule'
import { t } from '../../i18n/index'
import { shareOrDownload } from '../documents/share'
import { SectionTitle } from '../settings/SectionTitle'
import { formatDate } from '../tasks/labels'
import { backupFileName, backupFromFile, backupToBlob } from './excel'
import { type Backup, summarize } from './format'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * The owner's own copy of everything: one Excel file (a sheet per table) saved
 * to Files / iCloud or sent by email, and restored from the same file.
 */
export function BackupCard() {
  const settings = useSettingsQuery().data
  const [busy, setBusy] = useState<'export' | 'read' | 'restore' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [word, setWord] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const WORD = t('استعادة', 'RESTORE')
  const overdue = isBackupOverdue(settings?.lastBackupAt ?? undefined)

  const download = async () => {
    setBusy('export')
    setError(null)
    setDone(null)
    try {
      const blob = await backupToBlob(await exportBackup())
      // Closing the share sheet without saving is not a backup
      if ((await shareOrDownload(blob, backupFileName(todayIso()), XLSX)) === 'cancelled') return
      await markBackedUp()
      setDone(t('تم تصدير النسخة. يُرجى حفظها في «الملفات» أو iCloud أو إرسالها لبريدك.', 'Backup exported. Save it in Files or iCloud, or email it to yourself.'))
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(null)
    }
  }

  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy('read')
    setError(null)
    setDone(null)
    try {
      setPending(await backupFromFile(f))
      setWord('')
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(null)
      if (file.current) file.current.value = ''
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy('restore')
    setError(null)
    try {
      await restoreBackup(pending)
      setPending(null)
      setDone(t('تمت الاستعادة. البيانات الآن كما كانت يوم النسخة.', 'Restored. The data is now as it was on the backup day.'))
    } catch (e) {
      setError(serverError(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <SectionTitle
        note={t(
          'ملف Excel فيه كل البيانات (ورقة لكل جدول). يُحفظ خارج التطبيق كل أسبوع، ويُستعاد منه كل شيء عند الحاجة. الصور تبقى محفوظة في الخادم.',
          'One Excel file with all the data (a sheet per table). Keep it outside the app every week; everything can be restored from it. Photos stay on the server.',
        )}
      >
        {t('النسخة الاحتياطية', 'Backup')}
      </SectionTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {settings?.lastBackupAt ? (
          <span className="text-muted">{t(`آخر نسخة: ${formatDate(settings.lastBackupAt.slice(0, 10))}`, `Last backup: ${formatDate(settings.lastBackupAt.slice(0, 10))}`)}</span>
        ) : (
          <span className="text-muted">{t('لم تُصدَّر أي نسخة بعد.', 'No backup exported yet.')}</span>
        )}
        {overdue ? <Badge tone="amber">{t('حان وقت نسخة جديدة', 'Time for a new backup')}</Badge> : <Badge tone="green">{t('محدّثة', 'Up to date')}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={download} disabled={busy != null}>
          {busy === 'export' ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
          {t('تصدير نسخة Excel', 'Export Excel backup')}
        </Button>
        <input ref={file} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="secondary" onClick={() => file.current?.click()} disabled={busy != null}>
          {busy === 'read' ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          {t('استعادة من ملف', 'Restore from a file')}
        </Button>
      </div>
      {done && (
        <p className="mt-3 flex items-center gap-2 text-sm text-palm">
          <CheckCircle2 className="size-4 shrink-0" />
          {done}
        </p>
      )}
      <FormError message={error} />

      {pending && (
        <Modal
          open
          onClose={() => setPending(null)}
          title={t('استعادة النسخة الاحتياطية', 'Restore the backup')}
          footer={
            <Button className="flex-1 !bg-red-700" disabled={busy != null || word.trim() !== WORD} onClick={restore}>
              {busy === 'restore' ? t('جارٍ الاستعادة…', 'Restoring…') : t('استبدال كل البيانات بالنسخة', 'Replace all data with the backup')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              <DatabaseBackup className="size-5 shrink-0" />
              {t(
                `كل البيانات الحالية تُستبدل بنسخة ${pending.exported_at ? formatDate(pending.exported_at.slice(0, 10)) : ''}. ما سُجّل بعد ذلك التاريخ يُفقد. يُفضّل تصدير نسخة من الحالي أولاً.`,
                `All current data is replaced by the backup of ${pending.exported_at ? formatDate(pending.exported_at.slice(0, 10)) : ''}. Anything recorded after it is lost. Export a backup of the current data first.`,
              )}
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {summarize(pending).map(([label, n]) => (
                <li key={label} className="flex justify-between gap-2 border-b border-line py-1">
                  <span className="text-muted">{label}</span>
                  <span className="num font-bold">{n}</span>
                </li>
              ))}
            </ul>
            <Field label={t(`للتأكيد يُرجى كتابة «${WORD}»`, `Type «${WORD}» to confirm`)}>
              <TextInput value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
            </Field>
            <FormError message={error} />
          </div>
        </Modal>
      )}
    </Card>
  )
}
