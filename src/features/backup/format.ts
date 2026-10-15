/**
 * Excel backup format.
 *
 * Every table becomes one right-to-left sheet with readable Arabic columns
 * (amounts in rials) for viewing, plus a final «السجل الكامل» column holding the
 * full record as JSON. Restoring reads only that column, so a backup is
 * lossless even for fields that have no readable column.
 * The custom logo can exceed Excel's 32,767-character cell limit, so it is
 * split across rows of its own sheet.
 */

export const BACKUP_APP = 'zawrda-factory'
export const BACKUP_FORMAT_VERSION = 1
const RECORD_HEADER = 'السجل الكامل'
const META_SHEET = 'معلومات النسخة'
const LOGO_SHEET = 'الشعار'
const CHUNK = 30000

import { UNIT_LABELS } from '../../domain/quantity'
import { AR as ar } from '../../i18n/ar'

type Rec = Record<string, unknown>
type Display = (r: Rec, ctx: Lookups) => string | number | boolean | null | undefined

export interface Lookups {
  name: (table: 'items' | 'suppliers' | 'customers' | 'expenseCategories', id: unknown) => string
}

const rial = (k: string): Display => (r) => (typeof r[k] === 'number' ? Math.round(r[k] as number) / 1000 : null)
const cost = (k: string): Display => (r) => (typeof r[k] === 'number' ? Math.round((r[k] as number) * 1000) / 1e6 : null)
const f = (k: string): Display => (r) => r[k] as string | number | boolean | null | undefined
const yesNo = (k: string): Display => (r) => (r[k] ? 'نعم' : 'لا')
/** Shows a stored code (e.g. "cash") with its Arabic label. */
const label = (k: string, labels: Record<string, string>): Display => (r) => labels[r[k] as string] ?? (r[k] as string)
const method = label('method', ar.paymentMethods)
const lines = (k: string): Display => (r) => (Array.isArray(r[k]) ? (r[k] as unknown[]).length : 0)

export const TABLES: Array<{ table: string; sheet: string; columns: Array<[string, Display]> }> = [
  { table: 'settings', sheet: 'الإعدادات', columns: [['اسم المشروع', f('businessName')], ['الهاتف', f('businessPhone')], ['السجل التجاري', f('commercialRegNo')], ['العنوان', f('businessAddress')], ['الضريبة %', f('vatRatePercent')]] },
  { table: 'items', sheet: 'الأصناف', columns: [['الاسم', f('name')], ['النوع', label('type', ar.itemTypes)], ['الوحدة', label('unit', UNIT_LABELS)], ['الرصيد', f('qtyOnHand')], ['الحد الأدنى', f('minQty')], ['متوسط التكلفة (ر.ع)', cost('avgCostBaisa')], ['سعر البيع (ر.ع)', rial('salePriceBaisa')], ['نشط', yesNo('active')]] },
  { table: 'suppliers', sheet: 'الموردون', columns: [['الاسم', f('name')], ['الهاتف', f('phone')], ['البريد', f('email')], ['العنوان', f('address')], ['نشط', yesNo('active')]] },
  { table: 'purchases', sheet: 'فواتير الشراء', columns: [['التاريخ', f('date')], ['المورد', (r, c) => c.name('suppliers', r.supplierId)], ['رقم فاتورة المورد', f('supplierInvoiceNo')], ['عدد البنود', lines('lines')], ['الإجمالي (ر.ع)', rial('totalBaisa')]] },
  { table: 'supplierPayments', sheet: 'دفعات الموردين', columns: [['التاريخ', f('date')], ['المورد', (r, c) => c.name('suppliers', r.supplierId)], ['المبلغ (ر.ع)', rial('amountBaisa')], ['الطريقة', method]] },
  { table: 'recipes', sheet: 'الوصفات', columns: [['المنتج', (r, c) => c.name('items', r.finishedItemId)], ['عدد المكونات', lines('components')], ['تقديرية', yesNo('isEstimate')]] },
  { table: 'productionBatches', sheet: 'دفعات الإنتاج', columns: [['رقم الدفعة', f('batchNo')], ['التاريخ', f('date')], ['المنتج', (r, c) => c.name('items', r.finishedItemId)], ['الكمية', f('qtyProduced')], ['إجمالي التكلفة (ر.ع)', rial('totalCostBaisa')], ['تكلفة الوحدة (ر.ع)', cost('unitCostBaisa')]] },
  { table: 'customers', sheet: 'العملاء', columns: [['الاسم', f('name')], ['الهاتف', f('phone')], ['النوع', label('type', ar.customerTypes)], ['العنوان', f('address')], ['نشط', yesNo('active')]] },
  { table: 'quotations', sheet: 'عروض الأسعار', columns: [['الرقم', f('quoteNo')], ['التاريخ', f('date')], ['العميل', (r, c) => c.name('customers', r.customerId)], ['الإجمالي (ر.ع)', rial('totalBaisa')], ['الحالة', label('status', ar.quoteStatus)]] },
  { table: 'salesInvoices', sheet: 'فواتير البيع', columns: [['الرقم', f('invoiceNo')], ['التاريخ', f('date')], ['العميل', (r, c) => c.name('customers', r.customerId)], ['المجموع (ر.ع)', rial('subtotalBaisa')], ['الخصم (ر.ع)', rial('discountBaisa')], ['الضريبة (ر.ع)', rial('vatBaisa')], ['الإجمالي (ر.ع)', rial('totalBaisa')]] },
  { table: 'customerPayments', sheet: 'مقبوضات العملاء', columns: [['التاريخ', f('date')], ['العميل', (r, c) => c.name('customers', r.customerId)], ['المبلغ (ر.ع)', rial('amountBaisa')], ['الطريقة', method]] },
  { table: 'expenseCategories', sheet: 'تصنيفات المصروفات', columns: [['الاسم', f('name')]] },
  { table: 'expenses', sheet: 'المصروفات', columns: [['التاريخ', f('date')], ['التصنيف', (r, c) => c.name('expenseCategories', r.categoryId)], ['المبلغ (ر.ع)', rial('amountBaisa')], ['الطريقة', method], ['الوصف', f('description')]] },
  { table: 'stockMovements', sheet: 'حركات المخزون', columns: [['التاريخ', f('date')], ['الصنف', (r, c) => c.name('items', r.itemId)], ['النوع', label('type', ar.movementTypes)], ['الكمية', f('qty')], ['تكلفة الوحدة (ر.ع)', cost('unitCostBaisa')], ['ملاحظات', f('notes')]] },
]

export type BackupData = Record<string, Rec[]>

export interface SheetOut {
  sheet: string
  data: Array<Array<{ value: string | number | boolean; fontWeight?: 'bold' } | null>>
}

const cell = (v: unknown) => (v === null || v === undefined || v === '' ? null : { value: v as string | number | boolean })
const header = (v: string) => ({ value: v, fontWeight: 'bold' as const })

/** Builds the sheets for a backup (pure; the caller writes them to .xlsx). */
export function buildBackupSheets(data: BackupData, exportedAt: string, dbVersion: number): SheetOut[] {
  const byId = (table: string) => new Map((data[table] ?? []).map((r) => [r.id, r]))
  const maps = { items: byId('items'), suppliers: byId('suppliers'), customers: byId('customers'), expenseCategories: byId('expenseCategories') }
  const ctx: Lookups = { name: (t, id) => (maps[t].get(id)?.name as string) ?? '' }

  const counts: Array<[string, number]> = []
  const sheets: SheetOut[] = []
  let logo: string | undefined

  for (const spec of TABLES) {
    let rows = data[spec.table] ?? []
    if (spec.table === 'settings') {
      logo = rows[0]?.logoDataUrl as string | undefined
      rows = rows.map(({ logoDataUrl: _drop, ...rest }) => rest)
    }
    counts.push([spec.sheet, rows.length])
    sheets.push({
      sheet: spec.sheet,
      data: [
        [...spec.columns.map(([h]) => header(h)), header(RECORD_HEADER)],
        ...rows.map((r) => [...spec.columns.map(([, d]) => cell(d(r, ctx))), cell(JSON.stringify(r))]),
      ],
    })
  }
  if (logo) {
    const parts = logo.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? []
    sheets.push({ sheet: LOGO_SHEET, data: [[header('جزء من الشعار')], ...parts.map((p) => [cell(p)])] })
  }
  sheets.unshift({
    sheet: META_SHEET,
    data: [
      [header('البند'), header('القيمة')],
      [cell('التطبيق'), cell(BACKUP_APP)],
      [cell('إصدار صيغة النسخة'), cell(BACKUP_FORMAT_VERSION)],
      [cell('إصدار قاعدة البيانات'), cell(dbVersion)],
      [cell('تاريخ التصدير'), cell(exportedAt)],
      ...counts.map(([s, n]) => [cell(`عدد سجلات: ${s}`), cell(n)]),
    ],
  })
  return sheets
}

export class BackupFormatError extends Error {
  name = 'UserError'
}

/** Reads sheets produced by buildBackupSheets back into tables. Throws on a foreign or newer file. */
export function parseBackupSheets(sheets: Array<{ sheet: string; data: unknown[][] }>): { data: BackupData; exportedAt?: string } {
  const bySheet = new Map(sheets.map((s) => [s.sheet, s.data]))
  const meta = bySheet.get(META_SHEET)
  const metaValue = (label: string) => meta?.find((row) => row[0] === label)?.[1]
  if (!meta || metaValue('التطبيق') !== BACKUP_APP) throw new BackupFormatError('هذا الملف ليس نسخة احتياطية من تطبيق زوردة')
  if (Number(metaValue('إصدار صيغة النسخة')) > BACKUP_FORMAT_VERSION)
    throw new BackupFormatError('هذه النسخة من إصدار أحدث للتطبيق — حدّث التطبيق أولاً')

  const data: BackupData = {}
  for (const spec of TABLES) {
    const rows = bySheet.get(spec.sheet)
    if (!rows) throw new BackupFormatError(`الملف ناقص: لا توجد ورقة «${spec.sheet}»`)
    const col = (rows[0] ?? []).indexOf(RECORD_HEADER)
    if (col < 0) throw new BackupFormatError(`ورقة «${spec.sheet}» تالفة`)
    data[spec.table] = rows.slice(1).filter((r) => r[col]).map((r) => {
      try {
        return JSON.parse(String(r[col])) as Rec
      } catch {
        throw new BackupFormatError(`سجل تالف في ورقة «${spec.sheet}»`)
      }
    })
  }
  const logoRows = bySheet.get(LOGO_SHEET)
  if (logoRows && data.settings[0]) data.settings[0].logoDataUrl = logoRows.slice(1).map((r) => String(r[0] ?? '')).join('')
  return { data, exportedAt: metaValue('تاريخ التصدير') as string | undefined }
}

/** Short summary of record counts, for the restore confirmation. */
export function summarize(data: BackupData): Array<[string, number]> {
  return TABLES.filter((t) => t.table !== 'settings' && t.table !== 'stockMovements').map((t) => [t.sheet, data[t.table]?.length ?? 0])
}
