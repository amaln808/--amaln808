import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import { describe, expect, it } from 'vitest'
import { type Backup, buildBackupSheets, parseBackupSheets, summarize } from './format'

async function roundTrip(b: Backup) {
  const sheets = buildBackupSheets(b)
  const buffer = await writeXlsxFile(sheets.map((s) => ({ sheet: s.sheet, data: s.data, rightToLeft: true }))).toBuffer()
  return parseBackupSheets((await readXlsxFile(buffer)) as Array<{ sheet: string; data: unknown[][] }>)
}

const backup: Backup = {
  app: 'zawrda',
  format: 2,
  exported_at: '2026-10-26T08:00:00.000Z',
  tables: {
    settings: [{ id: 1, company_name: 'زوردة', address: 'بوشر، مسقط', vat_registered: false, default_vat_rate: 0, logo_path: null }],
    items: [{ id: 'a1', name: 'معجون 250 «خاص»', type: 'finished', min_qty: 0, weight_g: 250.5, active: true }],
    customers: [{ id: 'c1', name: 'متجر الخير', notes: 'سطر1\nسطر2', phone: '0096899123456' }],
    tasks: [{ id: 't1', title: 'تنظيف', weekdays: [0, 3], due_time: '08:30:00' }],
    expenses: [{ id: 'e1', date: '2026-10-01', amount_baisa: 23450, ocr_text: 'ف'.repeat(40_000) }],
    quotations: [],
  },
}

describe('excel backup', () => {
  it('survives a real .xlsx round trip losslessly', async () => {
    const back = await roundTrip(backup)
    expect(back.app).toBe('zawrda')
    expect(back.exported_at).toBe(backup.exported_at)
    expect(back.tables.settings).toEqual(backup.tables.settings)
    expect(back.tables.items).toEqual(backup.tables.items)
    expect(back.tables.customers).toEqual(backup.tables.customers) // line breaks and leading zeros kept
    expect(back.tables.tasks).toEqual(backup.tables.tasks)
    expect(back.tables.quotations).toEqual([])
    // A receipt text too long for one Excel cell is dropped, the expense itself is kept
    expect(back.tables.expenses).toEqual([{ ...backup.tables.expenses[0], ocr_text: null }])
    expect(summarize(back).find(([s]) => s === 'العملاء')?.[1]).toBe(1)
  })

  it('refuses a version 1 file, a foreign file and a newer format', () => {
    const meta = (rows: unknown[][]) => [{ sheet: 'معلومات النسخة', data: [['البند', 'القيمة'], ...rows] }]
    expect(() => parseBackupSheets(meta([['التطبيق', 'zawrda-factory']]))).toThrow(/الإصدار القديم/)
    expect(() => parseBackupSheets(meta([['التطبيق', 'other']]))).toThrow(/ليس نسخة/)
    expect(() => parseBackupSheets(meta([['التطبيق', 'zawrda'], ['إصدار صيغة النسخة', 3]]))).toThrow(/أحدث/)
    expect(() => parseBackupSheets(meta([['التطبيق', 'zawrda'], ['إصدار صيغة النسخة', 2]]))).toThrow(/الإعدادات/)
  })
})
