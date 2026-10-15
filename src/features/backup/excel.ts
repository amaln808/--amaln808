import { t } from '../../i18n/index'
import { buildBackupSheets, parseBackupSheets, type BackupData } from './format'

const widthFor = (rows: unknown[][], i: number) =>
  Math.min(40, Math.max(10, ...rows.slice(0, 50).map((r) => String((r[i] as { value?: unknown } | null)?.value ?? '').length + 2)))

/** Builds the .xlsx in the browser (library loaded on demand). */
export async function backupToBlob(data: BackupData, exportedAt: string, dbVersion: number): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const sheets = buildBackupSheets(data, exportedAt, dbVersion)
  return writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.sheet,
      data: s.data,
      rightToLeft: true,
      stickyRowsCount: 1,
      columns: (s.data[0] ?? []).map((_, i) => ({ width: i === s.data[0].length - 1 && s.data[0].length > 2 ? 18 : widthFor(s.data, i) })),
    })),
  ).toBlob()
}

export async function backupFromFile(file: File) {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  let sheets
  try {
    sheets = await readXlsxFile(file)
  } catch {
    throw Object.assign(new Error(t("تعذرت قراءة الملف — تأكد أنه ملف Excel صدّرته من التطبيق", "Couldn't read the file — make sure it's an Excel file exported from the app")), { name: 'UserError' })
  }
  return parseBackupSheets(sheets as Array<{ sheet: string; data: unknown[][] }>)
}

export function backupFileName(date: string): string {
  return `zawrda-backup-${date}.xlsx`
}
