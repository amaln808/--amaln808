import { describe, expect, it } from 'vitest'
import { buildCustomerStatement, customerEntries } from './statement'

const inv = (id: string, no: string, date: string, total: number, status: 'issued' | 'void' = 'issued') => ({ id, invoiceNo: no, customerId: 'c1', date, status, totalBaisa: total, createdAt: `${date}T10:00:00Z` })
const pay = (id: string, date: string, amount: number, invoiceId: string | null = null) => ({ id, customerId: 'c1', invoiceId, date, amountBaisa: amount, method: 'cash', notes: null })

describe('customer statement (checked by hand)', () => {
  const data = {
    invoices: [inv('i1', 'INV-0001', '2026-09-10', 400000), inv('i2', 'INV-0002', '2026-10-05', 250000), inv('i3', 'INV-0003', '2026-10-06', 99000, 'void'), { ...inv('x', 'INV-0009', '2026-10-01', 1), customerId: 'c2' }],
    payments: [pay('p1', '2026-09-20', 300000, 'i1'), pay('p2', '2026-10-15', 150000), pay('p3', '2026-10-20', 100000)],
    orders: [
      {
        id: 'o1', orderNo: 'O-0001', customerId: 'c1', orderDate: '2026-10-12', status: 'open' as const, invoiceId: null, amountBaisa: 200000,
        steps: [
          { id: 's1', kind: 'payment', doneDate: '2026-10-20', amountBaisa: 100000, paymentId: 'p3', method: 'bank', title: 'دفعة مقدمة' },
          { id: 's2', kind: 'payment', doneDate: '2026-10-25', amountBaisa: 30000, paymentId: null, method: 'cash', title: 'دفعة نقداً' },
          { id: 's3', kind: 'payment', doneDate: null, amountBaisa: 70000, paymentId: null, method: null, title: 'الأخيرة' },
        ],
      },
      { id: 'o2', orderNo: 'O-0002', customerId: 'c1', orderDate: '2026-10-13', status: 'cancelled' as const, invoiceId: null, amountBaisa: 500000, steps: [] },
    ],
  }
  const entries = customerEntries('c1', data)

  it('takes issued invoices, open orders and all money received, not void or other customers', () => {
    expect(entries.map((e) => [e.kind, e.ref, e.chargeBaisa, e.paymentBaisa])).toEqual([
      ['invoice', 'INV-0001', 400000, 0],
      ['invoice', 'INV-0002', 250000, 0],
      ['order', 'O-0001', 200000, 0],
      ['payment', 'O-0001', 0, 30000], // received on the order, not recorded as a receipt
      ['payment', 'INV-0001', 0, 300000],
      ['payment', null, 0, 150000],
      ['payment', 'O-0001', 0, 100000], // the receipt made from the order's payment stage
    ])
  })

  it('carries the balance before the period and runs it through the period', () => {
    // Before October: 400 − 300 = 100 owed
    const s = buildCustomerStatement(entries, { from: '2026-10-01', to: '2026-10-31' })
    expect(s.openingBaisa).toBe(100000)
    expect(s.chargesBaisa).toBe(450000)
    expect(s.paymentsBaisa).toBe(280000)
    // 100 + 450 − 280 = 270 (= 250 on INV-0002 − 150 on account + 70 left on O-0001 … + 100 from September)
    expect(s.closingBaisa).toBe(270000)
    expect(s.rows.map((r) => [r.ref, r.balanceBaisa])).toEqual([
      ['INV-0002', 350000],
      ['O-0001', 550000],
      [null, 400000],
      ['O-0001', 300000],
      ['O-0001', 270000],
    ])
  })

  it('counts an order payment whose receipt has not reached the server yet', () => {
    const e = customerEntries('c1', { ...data, payments: data.payments.filter((p) => p.id !== 'p3') })
    expect(e.filter((x) => x.kind === 'payment' && x.ref === 'O-0001').map((x) => x.paymentBaisa).sort()).toEqual([100000, 30000])
  })

  it('stops at the end of the period', () => {
    const s = buildCustomerStatement(entries, { from: '2026-09-01', to: '2026-09-30' })
    expect(s).toMatchObject({ openingBaisa: 0, chargesBaisa: 400000, paymentsBaisa: 300000, closingBaisa: 100000 })
  })
})
