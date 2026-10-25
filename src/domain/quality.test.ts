import { describe, expect, it } from 'vitest'
import { overLimit } from './quality'

describe('overLimit', () => {
  it('flags only values strictly above a set limit', () => {
    expect(overLimit('15.5', '15')).toBe(true)
    expect(overLimit(15, '15.00')).toBe(false)
    expect(overLimit('4', null)).toBe(false)
    expect(overLimit(null, 10)).toBe(false)
    expect(overLimit('٤٫5', 4)).toBe(true) // Arabic digits as typed on the iPad
  })
})
