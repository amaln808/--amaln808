import { describe, expect, it } from 'vitest'
import { toUnit, unitLabel, unitSuggestions } from './quantity'

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
    expect(unitSuggestions(['kg', 'علبة', 'علبة', ''])).toEqual(['kg', 'g', 'liter', 'ml', 'piece', 'علبة'])
  })
})
