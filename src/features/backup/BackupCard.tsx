import { t } from '../../i18n/index'
import { CheckCircle2, DatabaseBackup, Download, FileUp, Loader2, Share2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { isBackupOverdue } from '../../app/storage'
import { useSettings } from '../../app/useSettings'
import { FormError, TextInput } from '../../components/form'
import { errorMessage, formatDate } from '../../components/format'
import { Modal } from '../../components/Modal'
import { Badge, Button, Card } from '../../components/ui'
import { db } from '../../db/db'
import { today } from '../../db/records'
import { clearAllData, collectBackup, markBackedUp, restoreBackup } from '../../services/backup'
import { downloadBlob } from '../documents/pdf'
import { shareOrDownload } from '../documents/share'
import { backupFileName, backupFromFile, backupToBlob } from './excel'
import { type BackupData, summarize } from './format'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function prepareBackup() {
  const data = await collectBackup(db)
  const blob = await backupToBlob(data, new Date().toISOString(), db.verno)
  return { blob, name: backupFileName(today()) }
}

export function BackupCard() {
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<{ blob: Blob; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restore, setRestore] = useState<{ data: BackupData; exportedAt?: string } | null>(null)
  const [restored, setRestored] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // Step 1 builds the file; step 2 (a separate tap) shares it, as iOS requires.
  const prepare = () => run(async () => setPrepared(await prepareBackup()))
  const deliver = async (how: 'share' | 'download') => {
    if (!prepared) return
    if (how === 'share') {
      const r = await shareOrDownload(prepared.blob, prepared.name, XLSX_MIME)
      if (r === 'cancelled') return
    } else downloadBlob(prepared.blob, prepared.name)
    await markBackedUp(db)
  }

  const pickFile = (file?: File) => {
    if (!file) return
    run(async () => setRestore(await backupFromFile(file)))
    if (fileRef.current) fileRef.current.value = ''
  }

  const doRestore = () =>
    run(async () => {
      await restoreBackup(db, restore!.data)
      setRestore(null)
      setRestored(true)
    })

  const doClear = () =>
    run(async () => {
      await clearAllData(db)
      setClearing(false)
      setConfirmText('')
    })

  const overdue = settings && isBackupOverdue(settings.lastBackupAt)

  return (
    <>
      <Card className="mt-5" >
        <div id="backup" className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <DatabaseBackup className="size-5" /> {t("النسخ الاحتياطي", "Backup")}
          </h2>
          {overdue && <Badge tone="amber">{settings?.lastBackupAt ? t("مرّ أكثر من 7 أيام", "Over 7 days ago") : t("لم تُصدَّر نسخة بعد", "No backup yet")}</Badge>}
        </div>
        <p className="mb-4 text-sm text-stone-500">
          {t("بياناتك محفوظة على هذا الآيباد فقط. صدّر نسخة Excel أسبوعياً واحفظها في «الملفات» أو iCloud.", "Your data is stored on this iPad only. Export an Excel backup weekly and save it in Files or iCloud.")}
          {settings?.lastBackupAt && <> {t("آخر نسخة:", "Last backup:")} <span className="num">{formatDate(settings.lastBackupAt)}</span>.</>}
        </p>

        {!prepared ? (
          <Button onClick={prepare} disabled={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <DatabaseBackup className="size-5" />}
            {t("تصدير نسخة احتياطية (Excel)", "Export backup (Excel)")}
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="size-5" /> {t("الملف جاهز:", "File ready:")} <span className="num" dir="ltr">{prepared.name}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => deliver('share')}>
                <Share2 className="size-5" /> {t("حفظ في الملفات / مشاركة", "Save to Files / Share")}
              </Button>
              <Button variant="secondary" onClick={() => deliver('download')}>
                <Download className="size-5" /> {t("تنزيل", "Download")}
              </Button>
              <Button variant="ghost" onClick={() => setPrepared(null)}>{t("إغلاق", "Close")}</Button>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4">
          <h3 className="mb-1 font-bold">{t("استعادة من نسخة", "Restore from backup")}</h3>
          <p className="mb-3 text-sm text-stone-500">{t("اختر ملف Excel صدّرته سابقاً من التطبيق. ستحلّ بياناته محل كل البيانات الحالية.", "Choose an Excel file previously exported from the app. Its data will replace all current data.")}</p>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp className="size-5" /> {t("اختيار ملف النسخة", "Choose backup file")}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
          {restored && (
            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" /> {t("تمت الاستعادة بنجاح.", "Restored successfully.")}
            </p>
          )}
        </div>
        <div className="mt-3"><FormError message={error} /></div>
      </Card>

      <Card className="mt-5 border-red-200">
        <h2 className="mb-1 text-lg font-bold text-red-800">{t("منطقة الخطر", "Danger zone")}</h2>
        <p className="mb-3 text-sm text-stone-500">
          {t("مسح كل البيانات (مثلاً بعد التجربة وقبل البدء الفعلي). يعود التطبيق إلى بدايته مع الأصناف والتصنيفات الافتراضية.", "Erase all data (e.g. after testing, before real use). The app returns to its starting state with the default items and categories.")}
        </p>
        <Button variant="secondary" className="!border-red-300 !text-red-700" onClick={() => setClearing(true)}>
          <Trash2 className="size-5" /> {t("مسح كل البيانات", "Erase all data")}
        </Button>
      </Card>

      <Modal
        open={!!restore}
        onClose={() => setRestore(null)}
        title={t("تأكيد الاستعادة", "Confirm restore")}
        footer={
          <>
            <Button className="flex-1 !bg-red-600 hover:!bg-red-700" onClick={doRestore} disabled={busy}>{t("استعادة واستبدال البيانات", "Restore and replace data")}</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setRestore(null)}>{t("إلغاء", "Cancel")}</Button>
          </>
        }
      >
        {restore && (
          <div className="flex flex-col gap-3 text-sm">
            {restore.exportedAt && (
              <p>
                {t("نسخة بتاريخ", "Backup dated")} <b className="num">{formatDate(restore.exportedAt)}</b> {t("وتحتوي على:", "containing:")}
              </p>
            )}
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {summarize(restore.data).map(([name, n]) => (
                <li key={name} className="flex justify-between border-b border-stone-100 py-1">
                  <span className="text-stone-600">{name}</span>
                  <span className="num font-bold">{n}</span>
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              {t("⚠️ ستُحذف كل البيانات الحالية على هذا الجهاز وتحلّ محلها بيانات النسخة. إن لم تكن متأكداً، صدّر نسخة من بياناتك الحالية أولاً.", "⚠️ All current data on this device will be deleted and replaced by the backup. If unsure, export a backup of your current data first.")}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={clearing}
        onClose={() => setClearing(false)}
        title={t("مسح كل البيانات", "Erase all data")}
        footer={
          <>
            <Button className="flex-1 !bg-red-600 hover:!bg-red-700" disabled={confirmText.trim() !== t("حذف", "Delete") || busy} onClick={doClear}>
              {t("مسح نهائي", "Erase permanently")}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setClearing(false)}>{t("إلغاء", "Cancel")}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>{t("سيتم حذف كل الأصناف والحركات والموردين والعملاء والفواتير والمصروفات نهائياً. لا يمكن التراجع إلا من نسخة احتياطية.", "All items, movements, suppliers, customers, invoices and expenses will be permanently deleted. This can only be undone from a backup.")}</p>
          <label className="flex flex-col gap-1.5">
            {t("للتأكيد اكتب كلمة", "To confirm, type the word")} <b>{t("حذف", "Delete")}</b>
            <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
        </div>
      </Modal>
    </>
  )
}
