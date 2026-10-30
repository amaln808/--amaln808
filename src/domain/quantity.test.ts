import { describe, expect, it } from 'vitest'
import { baseToSmall, literHint, parseQty, smallToBase, smallUnitOf, toUnit, unitLabel, unitSuggestions } from './quantity'

describe('free-text units', () => {
  it('keeps the known units as codes, whatever way they are written', () => {
    expect(toUnit('مل')).toBe('ml')
    expect(toUnit(' مليلتر ')).toBe('ml')
    expect(toUnit('ML')).toBe('ml')
    expect(toUnit('لتر')).toBe('liter')
    expect(toUnit('كجم')).toBe('kg')
    expect(toUnit('جرام')).toBe('g')
    expect(toUnit('قطعة')).toBe('piece')
  })

  it('stores any other unit as typed and shows it as is', () => {
    expect(toUnit(' علبة  كرتون ')).toBe('علبة كرتون')
    expect(unitLabel('علبة كرتون', 'ar')).toBe('علبة كرتون')
    expect(unitLabel('ml', 'ar')).toBe('مل')
    expect(unitLabel('ml', 'en')).toBe('mL')
  })

  it('suggests the usual units, then the ones used before', () => {
    expect(unitSuggestions(['kg', 'علبة', 'علبة', ''])).toEqual(['kg', 'g', 'liter', 'piece', 'علبة'])
  })

  it('shows a quantity in litres also in millilitres', () => {
    expect(literHint('liter', '0.015', 'ar')).toBe('= 15 مل')
    expect(literHint('liter', '2.5', 'en')).toBe('= 2,500 mL')
    expect(literHint('kg', '0.015', 'ar')).toBeUndefined()
    expect(literHint('liter', '', 'ar')).toBeUndefined()
  })

  it('converts grams and millilitres to the stored kg and litres', () => {
    expect(smallUnitOf('kg')).toBe('g')
    expect(smallUnitOf('liter')).toBe('ml')
    expect(smallUnitOf('piece')).toBeNull()
    expect(smallToBase('175')).toBe('0.175')
    expect(smallToBase('١٢٫٥', 6)).toBe('0.0125')
    expect(smallToBase('0.5', 6)).toBe('0.0005')
    expect(smallToBase('12.5')).toBe('0.013') // batch totals keep whole grams
    expect(smallToBase('')).toBe('')
    expect(smallToBase('abc')).toBe('x')
    expect(baseToSmall('0.0125', 6)).toBe('12.5')
    expect(baseToSmall('0.175')).toBe('175')
    expect(parseQty('0.0005', 6)).toBe(0.0005)
    expect(parseQty('0.0005')).toBeNull()
  })
})
