import { describe, expect, it } from 'vitest'
import { placeLabels, sheetGrid } from './labels'

describe('label placement (checked by hand)', () => {
  it('fits labels on A4 with 8 mm margins and 3 mm gaps', () => {
    // 50 × 30: across (194 + 3) / 53 = 3, down (281 + 3) / 33 = 8
    expect(sheetGrid(50, 30)).toEqual({ cols: 3, rows: 8, perPage: 24 })
    // 100 × 50: across 197 / 103 = 1, down 284 / 53 = 5
    expect(sheetGrid(100, 50)).toEqual({ cols: 1, rows: 5, perPage: 5 })
    expect(sheetGrid(300, 50).perPage).toBe(0)
  })

  it('fills each sheet from the top right, centred, then starts a new page', () => {
    const p = placeLabels(50, 30, 26, 'sheet')
    expect(p).toHaveLength(26)
    // 3 labels use 156 mm → 27 mm each side; 8 rows use 261 mm → 18 mm top
    expect(p[0]).toEqual({ page: 0, x: 133, y: 18 })
    expect(p[2]).toEqual({ page: 0, x: 27, y: 18 })
    expect(p[3]).toEqual({ page: 0, x: 133, y: 51 })
    expect(p[24]).toEqual({ page: 1, x: 133, y: 18 })
  })

  it('puts one label per page for a label printer', () => {
    expect(placeLabels(60, 40, 3, 'roll').map((x) => x.page)).toEqual([0, 1, 2])
  })
})
