import { describe, expect, it } from 'vitest'
import { BRAND_SWATCHES, luminance, textOn } from './theme'

const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('theme colours', () => {
  it('picks readable text for any main colour', () => {
    expect(textOn('#6b5433')).toBe('#fbf8f2')
    expect(textOn('#f5d76e')).toBe('#1f1d19')
  })

  it('every offered swatch keeps button text at AA contrast', () => {
    for (const c of BRAND_SWATCHES) expect(contrast(c, textOn(c)), c).toBeGreaterThanOrEqual(4.5)
  })
})
