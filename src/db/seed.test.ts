import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { FactoryDB } from './db'
import { SETTINGS_ID, seedIfEmpty } from './seed'

describe('seedIfEmpty', () => {
  it('seeds once with 0% VAT, categories and both package sizes', async () => {
    const db = new FactoryDB('seed-test')
    await seedIfEmpty(db)
    await seedIfEmpty(db)

    const settings = await db.settings.get(SETTINGS_ID)
    expect(settings?.vatRatePercent).toBe(0)
    expect(settings?.currency).toBe('OMR')
    expect(settings).toMatchObject({ businessName: 'زوردة', businessPhone: '77681600', commercialRegNo: '1552738', businessAddress: 'بوشر', quotePrefix: 'Q-' })

    expect(await db.expenseCategories.count()).toBe(9)
    const names = (await db.expenseCategories.toArray()).map((c) => c.name)
    expect(names).toContain('رواتب')

    const finished = await db.items.where('type').equals('finished').toArray()
    expect(finished.map((i) => i.packageSizeG).sort()).toEqual([250, 500])
    expect(await db.items.count()).toBe(8)
    db.close()
  })
})

describe('v1 → v2 migration', () => {
  it('fills business details and quote numbering on an existing database', async () => {
    const Dexie = (await import('dexie')).default
    const name = 'migrate-test'
    const v1 = new Dexie(name)
    v1.version(1).stores({ settings: 'id' })
    await v1.table('settings').add({ id: SETTINGS_ID, businessName: 'مصنع معجون التمر', nextInvoiceNo: 4, vatRatePercent: 0 })
    v1.close()

    const db = new FactoryDB(name)
    const s = await db.settings.get(SETTINGS_ID)
    expect(s).toMatchObject({ businessName: 'زوردة', commercialRegNo: '1552738', nextInvoiceNo: 4, nextQuoteNo: 1, invoiceDueDays: 15 })
    expect(await db.quotations.count()).toBe(0)
    db.close()
  })
})
