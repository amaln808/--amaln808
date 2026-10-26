import { describe, expect, it } from 'vitest'
import { forecastCash, lastFullMonths } from './forecast'

describe('cash forecast', () => {
  it('adds open invoices due in the window, overdue apart, and the collected share of new sales', () => {
    const f = forecastCash({
      today: '2026-10-26',
      months: 1,
      openInvoices: [
        { dueDate: '2026-10-01', leftBaisa: 5000 }, // overdue
        { dueDate: '2026-11-10', leftBaisa: 20000 }, // due in the month
        { dueDate: '2027-01-10', leftBaisa: 99000 }, // later
        { dueDate: '2026-11-01', leftBaisa: 0 },
      ],
      salesByMonth: [30000, 60000, 90000], // average 60 000
      expensesByMonth: [10000, 20000, 30000], // average 20 000
      invoiceDueDays: 15,
      payableBaisa: 7000,
    })
    expect(f.until).toBe('2026-11-25')
    expect(f).toMatchObject({ overdueBaisa: 5000, dueBaisa: 20000, newSalesShare: 0.5, newSalesBaisa: 30000, inBaisa: 55000 })
    expect(f).toMatchObject({ payableBaisa: 7000, expensesBaisa: 20000, outBaisa: 27000, netBaisa: 28000 })
    // Three months: the January invoice now falls inside the window
    const f3 = forecastCash({ today: '2026-10-26', openInvoices: [{ dueDate: '2027-01-10', leftBaisa: 99000 }], salesByMonth: [60000], expensesByMonth: [], invoiceDueDays: 15, payableBaisa: 0, months: 3 })
    expect(f3).toMatchObject({ dueBaisa: 99000, newSalesBaisa: Math.round(180000 * (75 / 90)), outBaisa: 0 })
  })

  it('lists the last full months before this one', () => {
    expect(lastFullMonths('2026-10-26')).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(lastFullMonths('2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})
