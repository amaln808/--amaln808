import type { FactoryDB } from './db'
import { newRecord } from './records'
import type { ExpenseCategory, Item, Settings } from './types'

export const SETTINGS_ID = 'main'

const OLD_DEFAULT_NAME = 'مصنع معجون التمر'

export const BUSINESS_DEFAULTS = {
  businessName: 'زوردة',
  businessPhone: '77681600',
  commercialRegNo: '1552738',
  businessAddress: 'بوشر',
}

/** Fills settings fields added after v1, keeping anything the user already set. */
type UpgradedFields = Pick<
  Settings,
  | 'businessName'
  | 'businessPhone'
  | 'commercialRegNo'
  | 'businessAddress'
  | 'quotePrefix'
  | 'nextQuoteNo'
  | 'invoiceDueDays'
  | 'quoteValidityDays'
  | 'businessAddressEn'
  | 'docLanguage'
>

export function upgradeSettings(s: Partial<Settings>): UpgradedFields {
  return {
    businessName: !s.businessName || s.businessName === OLD_DEFAULT_NAME ? BUSINESS_DEFAULTS.businessName : s.businessName,
    businessPhone: s.businessPhone || BUSINESS_DEFAULTS.businessPhone,
    commercialRegNo: s.commercialRegNo || BUSINESS_DEFAULTS.commercialRegNo,
    businessAddress: s.businessAddress || BUSINESS_DEFAULTS.businessAddress,
    quotePrefix: s.quotePrefix ?? 'Q-',
    nextQuoteNo: s.nextQuoteNo ?? 1,
    invoiceDueDays: s.invoiceDueDays ?? 15,
    quoteValidityDays: s.quoteValidityDays ?? 14,
    businessAddressEn: s.businessAddressEn ?? (s.businessAddress === BUSINESS_DEFAULTS.businessAddress || !s.businessAddress ? 'Bawshar' : ''),
    docLanguage: s.docLanguage ?? 'ar',
  }
}

const DEFAULT_EXPENSE_CATEGORIES: Array<[string, string]> = [
  ['إيجار', '#8b5cf6'],
  ['كهرباء', '#f59e0b'],
  ['ماء', '#0ea5e9'],
  ['رواتب', '#10b981'],
  ['نقل', '#ef4444'],
  ['تسويق', '#ec4899'],
  ['صيانة', '#64748b'],
  ['رسوم حكومية', '#6366f1'],
  ['أخرى', '#a3a3a3'],
]

/** English names for the starter items and categories (matched by Arabic name). */
export const ENGLISH_NAMES: Record<string, string> = {
  'معجون تمر': 'Date paste',
  'فول سوداني': 'Peanuts',
  'علبة 250 جم': 'Jar 250 g',
  'علبة 500 جم': 'Jar 500 g',
  'غطاء علبة': 'Jar lid',
  'ملصق': 'Label',
  'معجون تمر بزبدة الفول السوداني ≈250 جم': 'Date Paste with Peanut Butter ≈250 g',
  'معجون تمر بزبدة الفول السوداني ≈500 جم': 'Date Paste with Peanut Butter ≈500 g',
  'إيجار': 'Rent',
  'كهرباء': 'Electricity',
  'ماء': 'Water',
  'رواتب': 'Salaries',
  'نقل': 'Transport',
  'تسويق': 'Marketing',
  'صيانة': 'Maintenance',
  'رسوم حكومية': 'Government fees',
  'أخرى': 'Other',
}

type SeedItem = Pick<Item, 'name' | 'type' | 'unit' | 'minQty'> & Partial<Item>

const DEFAULT_ITEMS: SeedItem[] = [
  { name: 'معجون تمر', type: 'raw', unit: 'kg', minQty: 10 },
  { name: 'فول سوداني', type: 'raw', unit: 'kg', minQty: 5 },
  { name: 'علبة 250 جم', type: 'packaging', unit: 'piece', minQty: 50 },
  { name: 'علبة 500 جم', type: 'packaging', unit: 'piece', minQty: 50 },
  { name: 'غطاء علبة', type: 'packaging', unit: 'piece', minQty: 100 },
  { name: 'ملصق', type: 'packaging', unit: 'piece', minQty: 100 },
  {
    name: 'معجون تمر بزبدة الفول السوداني ≈250 جم',
    type: 'finished',
    unit: 'piece',
    minQty: 20,
    packageSizeG: 250,
  },
  {
    name: 'معجون تمر بزبدة الفول السوداني ≈500 جم',
    type: 'finished',
    unit: 'piece',
    minQty: 20,
    packageSizeG: 500,
  },
]

/** Fills an empty database with settings, expense categories and starter items. */
export async function seedIfEmpty(db: FactoryDB): Promise<void> {
  await db.transaction('rw', [db.settings, db.expenseCategories, db.items], async () => {
    if (await db.settings.get(SETTINGS_ID)) return

    const now = new Date().toISOString()
    const settings: Settings = {
      id: SETTINGS_ID,
      createdAt: now,
      updatedAt: now,
      currency: 'OMR',
      vatRatePercent: 0,
      invoicePrefix: 'INV-',
      batchPrefix: 'B-',
      nextInvoiceNo: 1,
      nextBatchNo: 1,
      ...upgradeSettings({}),
    }
    await db.settings.add(settings)

    await db.expenseCategories.bulkAdd(
      DEFAULT_EXPENSE_CATEGORIES.map(
        ([name, color]): ExpenseCategory => newRecord({ name, nameEn: ENGLISH_NAMES[name], color, isDefault: true }),
      ),
    )

    await db.items.bulkAdd(
      DEFAULT_ITEMS.map(
        (it): Item => newRecord({ qtyOnHand: 0, avgCostBaisa: 0, active: true, nameEn: ENGLISH_NAMES[it.name], ...it }),
      ),
    )
  })
}
