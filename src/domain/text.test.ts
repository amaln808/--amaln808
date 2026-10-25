import { describe, expect, it } from 'vitest'
import { distinctNames, nameKey } from './text'

describe('nameKey', () => {
  it('treats spelling variants as the same name', () => {
    expect(nameKey('  مؤسسة  الإمارات ')).toBe(nameKey('مؤسسة الامارات'))
    expect(nameKey('علبة')).toBe(nameKey('علبه'))
    expect(nameKey('مُكسّرات')).toBe(nameKey('مكسرات'))
    expect(nameKey('Glass Jar')).toBe(nameKey('glass jar'))
  })
})

describe('distinctNames', () => {
  it('keeps the first spelling and drops blanks', () => {
    expect(distinctNames(['تمور', null, ' ', 'تمور ', 'عبوة', 'عبوه'])).toEqual(['تمور', 'عبوة'])
  })
})
