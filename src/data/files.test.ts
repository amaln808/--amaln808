import { describe, expect, it } from 'vitest'
import { fitWithin } from './files'

describe('fitWithin', () => {
  it('shrinks a camera photo to the longest side', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(400, 300, 1600)).toEqual({ width: 400, height: 300 })
  })
})
