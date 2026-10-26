import { describe, expect, it } from 'vitest'
import { agingBucket, agingTable, reminderMessage } from './aging'

describe('aging', () => {
  it('puts amounts in buckets by days past due', () => {
    const today = '2026-10-26'
    expect(agingBucket(null, today)).toBe('current')
    expect(agingBucket('2026-10-26', today)).toBe('current')
    expect(agingBucket('2026-10-25', today)).toBe('d1_30')
    expect(agingBucket('2026-09-26', today)).toBe('d1_30')
    expect(agingBucket('2026-09-25', today)).toBe('d31_60')
    expect(agingBucket('2026-07-28', today)).toBe('d61_90')
    expect(agingBucket('2026-07-27', today)).toBe('d90')
  })

  it('totals per customer and overall, skipping paid invoices', () => {
    const { byCustomer, all } = agingTable(
      [
        { id: '1', customerId: 'a', invoiceNo: 'INV-1', dueDate: '2026-10-30', leftBaisa: 24000 },
        { id: '2', customerId: 'b', invoiceNo: 'INV-2', dueDate: '2026-10-25', leftBaisa: 24500 },
        { id: '3', customerId: 'b', invoiceNo: 'INV-3', dueDate: '2026-06-01', leftBaisa: 1000 },
        { id: '4', customerId: 'a', invoiceNo: 'INV-4', dueDate: '2026-06-01', leftBaisa: 0 },
      ],
      '2026-10-26',
    )
    expect(byCustomer.get('a')).toMatchObject({ current: 24000, total: 24000 })
    expect(byCustomer.get('b')).toMatchObject({ d1_30: 24500, d90: 1000, total: 25500 })
    expect(all).toEqual({ current: 24000, d1_30: 24500, d31_60: 0, d61_90: 0, d90: 1000, total: 49500 })
  })

  it('writes a polite reminder with each late invoice and the total', () => {
    const msg = reminderMessage('صيدلية الشفاء', [{ id: '2', customerId: 'b', invoiceNo: 'INV-0002', dueDate: '2026-10-25', leftBaisa: 24500 }], 'زوردة', '2026-10-26')
    expect(msg).toContain('INV-0002')
    expect(msg).toContain('24.500')
    expect(msg).toContain('قبل 1 يوماً')
  })
})
