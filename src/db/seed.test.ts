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

    expect(await db.expenseCategories.count()).toBe(9)
    const names = (await db.expenseCategories.toArray()).map((c) => c.name)
    expect(names).toContain('رواتب')

    const finished = await db.items.where('type').equals('finished').toArray()
    expect(finished.map((i) => i.packageSizeG).sort()).toEqual([250, 500])
    expect(await db.items.count()).toBe(8)
    db.close()
  })
})
