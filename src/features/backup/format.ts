/**
 * Excel backup format (version 2, Supabase).
 *
 * The database answers export_backup() with every table; each table becomes one
 * right-to-left sheet. Its columns show the stored fields as they are (amounts in
 * baisa, so nothing is rounded) for reading, and a final «السجل الكامل» column
 * holds the full record as JSON. Restoring reads only that column and hands the
 * tables back to restore_backup(), so the file is lossless.
 */

export const BACKUP_APP = 'zawrda'
export const BACKUP_FORMAT_VERSION = 2
const RECORD_HEADER = 'السجل الكامل'
const META_SHEET = 'معلومات النسخة'
/** Excel refuses longer cells */
const CELL_LIMIT = 32_000

/** Sheet name of each table (Excel caps names at 31 characters). */
export const SHEETS: Record<string, string> = {
  settings: 'الإعدادات',
  doc_counters: 'الترقيم',
  expense_categories: 'تصنيفات المصروفات',
  suppliers: 'الموردون',
  items: 'الأصناف',
  stock_lots: 'دفعات المخزون',
  stock_movements: 'حركات المخزون',
  purchases: 'فواتير الشراء',
  purchase_lines: 'بنود الشراء',
  supplier_payments: 'دفعات الموردين',
  recipes: 'الوصفات',
  recipe_components: 'مكونات الوصفات',
  production_batches: 'دفعات الإنتاج',
  batch_consumption: 'مواد دفعات الإنتاج',
  quality_checks: 'فحوص الجودة',
  channels: 'القنوات',
  channel_prices: 'أسعار القنوات',
  customers: 'العملاء',
  sales_invoices: 'فواتير البيع',
  quotations: 'عروض الأسعار',
  quotation_lines: 'بنود العروض',
  invoice_lines: 'بنود الفواتير',
  invoice_line_lots: 'دفعات بنود الفواتير',
  customer_payments: 'مقبوضات العملاء',
  expenses: 'المصروفات',
  agreements: 'الاتفاقيات والتصاريح',
  tasks: 'المهام',
  task_completions: 'المهام المنجزة',
  assets: 'الأصول والمعدات',
}

type Rec = Record<string, unknown>
export interface Backup {
  app: string
  format: number
  exported_at: string
  tables: Record<string, Rec[]>
}

export interface SheetOut {
  sheet: string
  data: Array<Array<{ value: string | number | boolean; fontWeight?: 'bold' } | null>>
}

const header = (v: string) => ({ value: v, fontWeight: 'bold' as const })
function cell(v: unknown) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') v = JSON.stringify(v)
  if (typeof v === 'string' && v.length > CELL_LIMIT) v = `${v.slice(0, 200)}…`
  return { value: v as string | number | boolean }
}
/** The full record; a long receipt text (OCR) is dropped rather than break the file */
function recordJson(r: Rec): string {
  const json = JSON.stringify(r)
  return json.length <= CELL_LIMIT ? json : JSON.stringify({ ...r, ocr_text: null })
}

/** Builds the sheets for a backup (pure; the caller writes them to .xlsx). */
export function buildBackupSheets(b: Backup): SheetOut[] {
  const names = Object.keys(b.tables)
  const sheets: SheetOut[] = names.map((table) => {
    const rows = b.tables[table]
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    return {
      sheet: SHEETS[table] ?? table.slice(0, 31),
      data: [[...cols.map(header), header(RECORD_HEADER)], ...rows.map((r) => [...cols.map((c) => cell(r[c])), { value: recordJson(r) }])],
    }
  })
  sheets.unshift({
    sheet: META_SHEET,
    data: [
      [header('البند'), header('القيمة')],
      [cell('التطبيق'), cell(b.app)],
      [cell('إصدار صيغة النسخة'), cell(b.format)],
      [cell('تاريخ التصدير'), cell(b.exported_at)],
      ...names.map((t) => [cell(`جدول ${t}`), cell(SHEETS[t] ?? t)]),
    ],
  })
  return sheets
}

export class BackupFormatError extends Error {
  name = 'UserError'
}

/** Reads sheets produced by buildBackupSheets back into tables. Throws on a foreign, old or newer file. */
export function parseBackupSheets(sheets: Array<{ sheet: string; data: unknown[][] }>): Backup {
  const bySheet = new Map(sheets.map((s) => [s.sheet, s.data]))
  const meta = bySheet.get(META_SHEET) ?? []
  const value = (label: string) => meta.find((row) => row[0] === label)?.[1]
  if (value('التطبيق') === 'zawrda-factory')
    throw new BackupFormatError('هذه نسخة من الإصدار القديم للتطبيق (المحفوظ على الجهاز) ولا تُستعاد في الإصدار الحالي')
  if (value('التطبيق') !== BACKUP_APP) throw new BackupFormatError('هذا الملف ليس نسخة احتياطية من تطبيق زوردة')
  const format = Number(value('إصدار صيغة النسخة'))
  if (format > BACKUP_FORMAT_VERSION) throw new BackupFormatError('هذه النسخة من إصدار أحدث للتطبيق — يُرجى تحديث التطبيق أولاً')

  const tables: Record<string, Rec[]> = {}
  for (const row of meta) {
    const m = /^جدول (.+)$/.exec(String(row[0] ?? ''))
    if (!m) continue
    const table = m[1]
    const sheet = String(row[1])
    const rows = bySheet.get(sheet)
    if (!rows) throw new BackupFormatError(`الملف ناقص: لا توجد ورقة «${sheet}»`)
    const col = (rows[0] ?? []).indexOf(RECORD_HEADER)
    if (col < 0) throw new BackupFormatError(`ورقة «${sheet}» تالفة`)
    tables[table] = rows
      .slice(1)
      .filter((r) => r[col])
      .map((r) => {
        try {
          return JSON.parse(String(r[col])) as Rec
        } catch {
          throw new BackupFormatError(`سجل تالف في ورقة «${sheet}»`)
        }
      })
  }
  if (!tables.settings?.length) throw new BackupFormatError('الملف ناقص: لا توجد ورقة الإعدادات')
  return { app: BACKUP_APP, format, exported_at: String(value('تاريخ التصدير') ?? ''), tables }
}

/** Record counts shown before restoring (the main tables only). */
export function summarize(b: Backup): Array<[string, number]> {
  return ['items', 'suppliers', 'purchases', 'production_batches', 'customers', 'quotations', 'sales_invoices', 'customer_payments', 'expenses', 'agreements', 'tasks'].map((t) => [
    SHEETS[t],
    b.tables[t]?.length ?? 0,
  ])
}
