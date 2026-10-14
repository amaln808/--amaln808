import { describe, expect, it } from 'vitest'
import { formatBaisa, formatOMR, lineTotal, normalizeDigits, parseRialToBaisa } from './money'
import { formatQty, formatSignedQty, parseQty } from './quantity'

describe('money', () => {
  it('formats baisa as rials with 3 decimals', () => {
    expect(formatBaisa(1234500)).toBe('1,234.500')
    expect(formatBaisa(5)).toBe('0.005')
    expect(formatOMR(0)).toBe('0.000 ر.ع')
    expect(formatOMR(-5000)).toBe('\u2066-5.000\u2069 ر.ع')
  })

  it('parses rial input into integer baisa', () => {
    expect(parseRialToBaisa('1.5')).toBe(1500)
    expect(parseRialToBaisa('0.005')).toBe(5)
    expect(parseRialToBaisa('12')).toBe(12000)
    expect(parseRialToBaisa('.25')).toBe(250)
    expect(parseRialToBaisa('1,250.750')).toBe(1250750)
    expect(parseRialToBaisa('١٢٫٥')).toBe(12500)
  })

  it('rejects invalid amounts', () => {
    expect(parseRialToBaisa('')).toBeNull()
    expect(parseRialToBaisa('.')).toBeNull()
    expect(parseRialToBaisa('1.2345')).toBeNull()
    expect(parseRialToBaisa('abc')).toBeNull()
  })

  it('avoids floating point errors on 0.1 + 0.2 style sums', () => {
    expect(parseRialToBaisa('0.1')! + parseRialToBaisa('0.2')!).toBe(300)
  })

  it('computes line totals rounded to baisa', () => {
    expect(lineTotal(3, 1250)).toBe(3750)
    expect(lineTotal(0.333, 1000)).toBe(333)
  })

  it('normalizes Arabic-Indic digits', () => {
    expect(normalizeDigits('٣٤٥')).toBe('345')
  })
})

describe('quantity', () => {
  it('parses and formats quantities', () => {
    expect(parseQty('2.5')).toBe(2.5)
    expect(parseQty('٢٥٠')).toBe(250)
    expect(parseQty('x')).toBeNull()
    expect(formatQty(12.5, 'kg')).toBe('12.5 كجم')
    expect(formatSignedQty(-2, 'kg')).toBe('\u2066−2\u2069 كجم')
    expect(formatSignedQty(20)).toBe('\u2066+20\u2069')
  })
})
