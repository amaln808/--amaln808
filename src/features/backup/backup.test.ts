import 'fake-indexeddb/auto'
import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import { describe, expect, it } from 'vitest'
import { FactoryDB } from '../../db/db'
import { seedIfEmpty } from '../../db/seed'
import { collectBackup, clearAllData, restoreBackup } from '../../services/backup'
import { saveCustomer } from '../../services/customers'
import { saveExpense } from '../../services/expenses'
import { createItem } from '../../services/items'
import { createInvoice } from '../../services/sales'
import { updateSettings } from '../../services/settings'
import { buildBackupSheets, parseBackupSheets, summarize } from './format'

async function roundTrip(data: Parameters<typeof buildBackupSheets>[0]) {
  const sheets = buildBackupSheets(data, '2026-10-15T08:00:00.000Z', 2)
  const buffer = await writeXlsxFile(sheets.map((s) => ({ sheet: s.sheet, data: s.data, rightToLeft: true }))).toBuffer()
  return parseBackupSheets((await readXlsxFile(buffer)) as Array<{ sheet: string; data: unknown[][] }>)
}

describe('excel backup', () => {
  it('survives a real .xlsx round trip losslessly, including a large logo', async () => {
    const db = new FactoryDB('backup-roundtrip')
    await seedIfEmpty(db)
    const bigLogo = 'data:image/png;base64,' + 'A'.repeat(70_000)
    await updateSettings(db, { logoDataUrl: bigLogo, businessAddress: 'بوشر، مسقط' })
    const jar = await createItem(db, { name: 'معجون 250 «خاص»', type: 'finished', unit: 'piece', minQty: 0, salePriceBaisa: 2300 }, { qty: 40, unitCostBaisa: 365.125 })
    const cust = await saveCustomer(db, { name: 'متجر الخير', phone: '99123456', type: 'store', notes: 'سطر1\nسطر2' })
    await createInvoice(db, { customerId: cust, date: '2026-10-14', lines: [{ itemId: jar, qty: 3, unitPriceBaisa: 2300 }], discountBaisa: 100, paidNow: { amountBaisa: 1000, method: 'cash' } })
    const rent = (await db.expenseCategories.where('name').equals('إيجار').first())!.id
    await saveExpense(db, { categoryId: rent, date: '2026-10-01', amountBaisa: 150000, method: 'bank' })

    const original = await collectBackup(db)
    const { data, exportedAt } = await roundTrip(original)
    expect(exportedAt).toBe('2026-10-15T08:00:00.000Z')
    expect(data).toEqual(original)
    expect(data.settings[0].logoDataUrl).toBe(bigLogo)
    expect(summarize(data).find(([s]) => s === 'فواتير البيع')?.[1]).toBe(1)
    db.close()
  })

  it('shows readable Arabic columns with amounts in rials', () => {
    const sheets = buildBackupSheets(
      { settings: [{ id: 'main', businessName: 'زوردة' }], expenses: [{ id: 'e', date: '2026-10-01', amountBaisa: 150500, categoryId: 'c', method: 'cash' }], expenseCategories: [{ id: 'c', name: 'إيجار' }] },
      'now',
      2,
    )
    const exp = sheets.find((s) => s.sheet === 'المصروفات')!
    expect(exp.data[0].map((c) => c?.value)).toEqual(['التاريخ', 'التصنيف', 'المبلغ (ر.ع)', 'الطريقة', 'الوصف', 'السجل الكامل'])
    expect(exp.data[1].slice(0, 3).map((c) => c?.value)).toEqual(['2026-10-01', 'إيجار', 150.5])
    expect(sheets[0].sheet).toBe('معلومات النسخة')
  })

  it('rejects foreign or newer files', () => {
    expect(() => parseBackupSheets([{ sheet: 'Sheet1', data: [['a']] }])).toThrow(/ليس نسخة احتياطية/)
    expect(() =>
      parseBackupSheets([{ sheet: 'معلومات النسخة', data: [['البند', 'القيمة'], ['التطبيق', 'zawrda-factory'], ['إصدار صيغة النسخة', 99]] }]),
    ).toThrow(/إصدار أحدث/)
  })

  it('restores into a database, replacing what was there', async () => {
    const src = new FactoryDB('backup-src')
    await seedIfEmpty(src)
    await saveCustomer(src, { name: 'عميل للاستعادة', phone: '', type: 'individual' })
    const backup = await collectBackup(src)

    const dst = new FactoryDB('backup-dst')
    await seedIfEmpty(dst)
    await saveCustomer(dst, { name: 'سيُحذف', phone: '', type: 'individual' })
    await restoreBackup(dst, backup)
    expect((await dst.customers.toArray()).map((c) => c.name)).toEqual(['عميل للاستعادة'])
    expect(await dst.items.count()).toBe(await src.items.count())

    await clearAllData(dst)
    expect(await dst.customers.count()).toBe(0)
    expect(await dst.items.count()).toBe(8)
    expect(await dst.recipes.count()).toBe(2)
    src.close()
    dst.close()
  })
})
