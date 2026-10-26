import { t } from '../../i18n/index'
import { type Backup, buildBackupSheets, parseBackupSheets } from './format'

const widthFor = (rows: unknown[][], i: number) =>
  Math.min(40, Math.max(10, ...rows.slice(0, 50).map((r) => String((r[i] as { value?: unknown } | null)?.value ?? '').length + 2)))

/** Builds the .xlsx in the browser (library loaded on demand). */
export async function backupToBlob(b: Backup): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  return writeXlsxFile(
    buildBackupSheets(b).map((s) => ({
      sheet: s.sheet,
      data: s.data,
      rightToLeft: true,
      stickyRowsCount: 1,
      columns: (s.data[0] ?? []).map((_, i) => ({ width: i === s.data[0].length - 1 && s.data[0].length > 2 ? 18 : widthFor(s.data, i) })),
    })),
  ).toBlob()
}

export async function backupFromFile(file: File): Promise<Backup> {
  const { default: readXlsxFile } = await import('read-excel-file/browser')
  let sheets
  try {
    sheets = await readXlsxFile(file)
  } catch {
    throw Object.assign(new Error(t('تعذرت قراءة الملف — يُرجى اختيار ملف Excel صدر من التطبيق.', "Couldn't read the file — choose an Excel file exported from the app.")), { name: 'UserError' })
  }
  return parseBackupSheets(sheets as Array<{ sheet: string; data: unknown[][] }>)
}

export function backupFileName(date: string): string {
  return `zuwardah-backup-${date}.xlsx`
}
