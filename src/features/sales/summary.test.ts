import { describe, expect, it } from 'vitest'
import type { SalesData } from '../../data/sales'
import { summarize } from './summary'

const data = (over: Partial<SalesData> = {}): SalesData =>
  ({
    channels: [],
    prices: [],
    customers: [{ id: 'c1', name: 'خالد', active: true }],
    quotations: [],
    invoices: [],
    payments: [],
    ...over,
  }) as unknown as SalesData

const order = {
  id: 'o1',
  orderNo: 'O-0001',
  customerId: 'c1',
  status: 'open' as const,
  invoiceId: null,
  amountBaisa: 200000,
  dueDate: '2026-12-01',
  steps: [
    { kind: 'payment' as const, sortOrder: 1, plannedDate: '2026-11-03', doneDate: '2026-11-03', amountBaisa: 100000, paymentId: 'p1' },
    { kind: 'payment' as const, sortOrder: 2, plannedDate: '2026-11-20', doneDate: null, amountBaisa: 100000, paymentId: null },
  ],
}
const receipt = { id: 'p1', customerId: 'c1', invoiceId: null, date: '2026-11-03', amountBaisa: 100000, method: 'cash', notes: null }

describe('customer balances with orders', () => {
  it('an order of 200 with 100 received leaves 100 owed (not a 100 credit)', () => {
    const b = summarize(data({ payments: [receipt] as SalesData['payments'] }), '2026-11-03', [order]).balances.get('c1')!
    expect(b).toMatchObject({ orderBaisa: 100000, dueBaisa: 100000, overdueBaisa: 0 })
    // Without the order (as before) the receipt looked like a credit
    expect(summarize(data({ payments: [receipt] as SalesData['payments'] }), '2026-11-03').balances.get('c1')!.dueBaisa).toBe(-100000)
  })

  it('once invoiced, the invoice counts and the order does not', () => {
    const invoice = { id: 'i1', customerId: 'c1', status: 'issued', date: '2026-11-04', createdAt: '2026-11-04', dueDate: '2026-11-19', totalBaisa: 200000 }
    const s = summarize(
      data({ invoices: [invoice] as unknown as SalesData['invoices'], payments: [{ ...receipt, invoiceId: 'i1' }] as SalesData['payments'] }),
      '2026-11-05',
      [{ ...order, invoiceId: 'i1' }],
    )
    expect(s.balances.get('c1')).toMatchObject({ orderBaisa: 0, dueBaisa: 100000 })
    expect(s.invoiceInfo.get('i1')).toMatchObject({ paidBaisa: 100000, status: 'partial' })
  })
})
