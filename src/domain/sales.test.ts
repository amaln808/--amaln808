import { describe, expect, it } from 'vitest'
import { addDays, allocatePayments, computeTotals, invoiceStatus, netRevenue, quoteDisplayStatus, toWhatsAppNumber } from './sales'

describe('sales totals', () => {
  it('applies discount then VAT at 0%', () => {
    const t = computeTotals([{ qty: 10, unitPriceBaisa: 2500 }, { qty: 4, unitPriceBaisa: 4500 }], 3000, 0)
    expect(t).toEqual({ subtotalBaisa: 43000, discountBaisa: 3000, vatRatePercent: 0, vatBaisa: 0, totalBaisa: 40000 })
    expect(netRevenue(t)).toBe(40000)
  })

  it('computes VAT on the discounted amount when a rate is set', () => {
    const t = computeTotals([{ qty: 1, unitPriceBaisa: 10000 }], 1000, 5)
    expect(t.vatBaisa).toBe(450)
    expect(t.totalBaisa).toBe(9450)
    expect(netRevenue(t)).toBe(9000)
  })

  it('caps the discount at the subtotal', () => {
    expect(computeTotals([{ qty: 1, unitPriceBaisa: 1000 }], 5000, 0).totalBaisa).toBe(0)
  })
})

describe('payment allocation', () => {
  const invoices = [
    { id: 'b', date: '2026-10-05', createdAt: '2', totalBaisa: 5000 },
    { id: 'a', date: '2026-10-01', createdAt: '1', totalBaisa: 10000 },
  ]

  it('applies linked payments then settles oldest first', () => {
    const { paid, creditBaisa } = allocatePayments(invoices, [
      { invoiceId: 'b', amountBaisa: 2000 },
      { amountBaisa: 11000 },
    ])
    expect(paid.get('a')).toBe(10000)
    expect(paid.get('b')).toBe(3000)
    expect(creditBaisa).toBe(0)
  })

  it('moves overpayment of an invoice to the others and keeps any credit', () => {
    const { paid, creditBaisa } = allocatePayments(invoices, [{ invoiceId: 'b', amountBaisa: 17000 }])
    expect(paid.get('b')).toBe(5000)
    expect(paid.get('a')).toBe(10000)
    expect(creditBaisa).toBe(2000)
  })
})

describe('statuses', () => {
  it('derives invoice status', () => {
    expect(invoiceStatus(1000, 1000, '2026-10-01', '2026-10-14')).toBe('paid')
    expect(invoiceStatus(1000, 500, '2026-10-01', '2026-10-14')).toBe('overdue')
    expect(invoiceStatus(1000, 500, '2026-10-20', '2026-10-14')).toBe('partial')
    expect(invoiceStatus(1000, 0, '2026-10-14', '2026-10-14')).toBe('unpaid')
  })

  it('derives quotation status', () => {
    expect(quoteDisplayStatus({ status: 'sent', validUntil: '2026-10-01' }, '2026-10-14')).toBe('expired')
    expect(quoteDisplayStatus({ status: 'sent', validUntil: '2026-10-30' }, '2026-10-14')).toBe('sent')
    expect(quoteDisplayStatus({ status: 'accepted', invoiceId: 'x' }, '2026-10-14')).toBe('invoiced')
    expect(quoteDisplayStatus({ status: 'rejected', validUntil: '2026-10-01' }, '2026-10-14')).toBe('rejected')
  })
})

describe('helpers', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-25', 14)).toBe('2026-11-08')
  })

  it('normalizes Omani numbers for WhatsApp', () => {
    expect(toWhatsAppNumber('7768 1600')).toBe('96877681600')
    expect(toWhatsAppNumber('٩٩١٢٣٤٥٦')).toBe('96899123456')
    expect(toWhatsAppNumber('+968 9912 3456')).toBe('96899123456')
    expect(toWhatsAppNumber('00971501234567')).toBe('971501234567')
    expect(toWhatsAppNumber('123')).toBeNull()
  })
})
