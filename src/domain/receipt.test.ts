import { describe, expect, it } from 'vitest'
import { findAmounts, findDates, guessReceipt } from './receipt'

describe('receipt reading', () => {
  it('reads day-first and year-first dates, and Arabic digits', () => {
    expect(findDates('Date: 12/10/2026 Time 10:30')).toEqual(['2026-10-12'])
    expect(findDates('2026-09-30')).toEqual(['2026-09-30'])
    expect(findDates('التاريخ ٠٥/١٠/٢٠٢٦')).toEqual(['2026-10-05'])
    expect(findDates('31/02/2026')).toEqual([])
  })

  it('reads OMR amounts with three decimals and thousands', () => {
    expect(findAmounts('Total 1,234.500 OMR')).toEqual([1234500])
    expect(findAmounts('المجموع ٢٣٫٤٥٠ ر.ع')).toEqual([23450])
    expect(findAmounts('Qty 2 x 1.5')).toEqual([2000, 1500])
  })

  it('takes the largest amount on a total line and the latest past date', () => {
    const text = [
      'Oman Electricity',
      'Bill date 01/10/2026  Due 15/11/2026',
      'Units 450   Rate 0.025',
      'Previous balance 2.100',
      'Total amount due   23.450',
      'Customer 90000011',
    ].join('\n')
    expect(guessReceipt(text, '2026-10-26')).toEqual({ date: '2026-10-01', amountBaisa: 23450 })
  })

  it('falls back to the largest decimal amount when no total line is found', () => {
    expect(guessReceipt('item 3.200\nitem 8.750\nphone 99887766', '2026-10-26')).toEqual({ date: null, amountBaisa: 8750 })
  })
})
