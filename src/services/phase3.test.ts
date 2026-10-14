import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FactoryDB } from '../db/db'
import { seedIfEmpty } from '../db/seed'
import { invoiceStatus } from '../domain/sales'
import { customerBalances, customerStatement, deleteCustomer, invoicePaidAmounts, recordCustomerPayment, saveCustomer } from './customers'
import { UserError } from './errors'
import { createItem } from './items'
import { createInvoice, createQuote, deleteInvoice, setQuoteStatus } from './sales'

let db: FactoryDB
let n = 0
beforeEach(async () => {
  db = new FactoryDB(`phase3-${n++}`)
  await seedIfEmpty(db)
})
afterEach(() => db.close())

async function setup() {
  const jar = await createItem(
    db,
    { name: 'معجون 250', type: 'finished', unit: 'piece', minQty: 0, salePriceBaisa: 2500 },
    { qty: 40, unitCostBaisa: 365 },
  )
  const raw = await createItem(db, { name: 'تمر', type: 'raw', unit: 'kg', minQty: 0 }, { qty: 5, unitCostBaisa: 1200 })
  const customer = await saveCustomer(db, { name: 'متجر الخير', phone: '99123456', type: 'store' })
  return { jar, raw, customer }
}

describe('quotations', () => {
  it('numbers quotes, ignores stock, and converts to an invoice', async () => {
    const { jar, customer } = await setup()
    const q = await createQuote(db, {
      customerId: customer,
      date: '2026-10-14',
      validUntil: '2026-10-28',
      lines: [{ itemId: jar, qty: 100, unitPriceBaisa: 2300 }],
      discountBaisa: 5000,
    })
    const quote = (await db.quotations.get(q))!
    expect(quote).toMatchObject({ quoteNo: 'Q-0001', status: 'draft', subtotalBaisa: 230000, totalBaisa: 225000, vatRatePercent: 0 })
    expect((await db.items.get(jar))!.qtyOnHand).toBe(40)

    await setQuoteStatus(db, q, 'sent')
    const inv = await createInvoice(db, {
      customerId: customer,
      date: '2026-10-15',
      lines: [{ itemId: jar, qty: 30, unitPriceBaisa: 2300 }],
      quoteId: q,
    })
    expect(await db.quotations.get(q)).toMatchObject({ status: 'accepted', invoiceId: inv })
    await expect(setQuoteStatus(db, q, 'rejected')).rejects.toThrow(UserError)

    await deleteInvoice(db, inv)
    expect(await db.quotations.get(q)).toMatchObject({ status: 'sent', invoiceId: undefined })
  })
})

describe('invoices', () => {
  it('deducts stock, snapshots cost, records payment and tracks receivables', async () => {
    const { jar, customer } = await setup()
    const id = await createInvoice(db, {
      customerId: customer,
      date: '2026-10-14',
      dueDate: '2026-10-29',
      lines: [{ itemId: jar, qty: 10, unitPriceBaisa: 2500 }],
      discountBaisa: 1000,
      paidNow: { amountBaisa: 10000, method: 'cash' },
    })
    const inv = (await db.salesInvoices.get(id))!
    expect(inv).toMatchObject({ invoiceNo: 'INV-0001', subtotalBaisa: 25000, discountBaisa: 1000, vatBaisa: 0, totalBaisa: 24000 })
    expect(inv.lines[0].unitCostBaisa).toBe(365)
    expect((await db.items.get(jar))!.qtyOnHand).toBe(30)
    expect(await db.stockMovements.where('type').equals('sale').count()).toBe(1)

    expect((await customerBalances(db)).get(customer)).toBe(14000)
    await recordCustomerPayment(db, { customerId: customer, date: '2026-10-20', amountBaisa: 4000, method: 'bank' })
    expect((await invoicePaidAmounts(db)).get(id)).toBe(14000)
    expect((await customerStatement(db, customer)).at(-1)!.balanceBaisa).toBe(10000)
    expect(invoiceStatus(24000, 14000, inv.dueDate, '2026-11-01')).toBe('overdue')

    const second = await createInvoice(db, { customerId: customer, date: '2026-10-16', lines: [{ itemId: jar, qty: 1, unitPriceBaisa: 2500 }] })
    expect((await db.salesInvoices.get(second))!.invoiceNo).toBe('INV-0002')
  })

  it('refuses to oversell or sell raw materials, changing nothing', async () => {
    const { jar, raw, customer } = await setup()
    await expect(
      createInvoice(db, { customerId: customer, date: '2026-10-14', lines: [{ itemId: jar, qty: 41, unitPriceBaisa: 2500 }] }),
    ).rejects.toThrow(/غير متوفرة/)
    await expect(
      createInvoice(db, { customerId: customer, date: '2026-10-14', lines: [{ itemId: raw, qty: 1, unitPriceBaisa: 1 }] }),
    ).rejects.toThrow(UserError)
    expect(await db.salesInvoices.count()).toBe(0)
    expect((await db.items.get(jar))!.qtyOnHand).toBe(40)
    // failed attempts don't consume invoice numbers
    const id = await createInvoice(db, { customerId: customer, date: '2026-10-14', lines: [{ itemId: jar, qty: 1, unitPriceBaisa: 2500 }] })
    expect((await db.salesInvoices.get(id))!.invoiceNo).toBe('INV-0001')
  })

  it('deleting an invoice restores stock and removes its payments', async () => {
    const { jar, customer } = await setup()
    const id = await createInvoice(db, {
      customerId: customer,
      date: '2026-10-14',
      lines: [{ itemId: jar, qty: 10, unitPriceBaisa: 2500 }],
      paidNow: { amountBaisa: 25000, method: 'cash' },
    })
    await deleteInvoice(db, id)
    expect((await db.items.get(jar))!.qtyOnHand).toBe(40)
    expect(await db.customerPayments.count()).toBe(0)
    await expect(deleteCustomer(db, customer)).resolves.toBeUndefined()
  })
})
