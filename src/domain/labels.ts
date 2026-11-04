/** Placing labels on paper. All sizes in millimetres. */

export const A4 = { w: 210, h: 297 }
export const SHEET_MARGIN = 8
export const SHEET_GAP = 3

export interface Placement {
  page: number
  x: number
  y: number
}

/** How many labels fit across and down an A4 sheet (margins and gaps between them). */
export function sheetGrid(w: number, h: number): { cols: number; rows: number; perPage: number } {
  const fit = (space: number, size: number) => Math.max(0, Math.floor((space - 2 * SHEET_MARGIN + SHEET_GAP) / (size + SHEET_GAP)))
  const cols = fit(A4.w, w)
  const rows = fit(A4.h, h)
  return { cols, rows, perPage: cols * rows }
}

/**
 * Where each label goes. «roll»: one label per page the size of the label
 * (label printers). «sheet»: as many as fit on each A4 page, centred, filled
 * row by row from the top right (as read in Arabic).
 */
export function placeLabels(w: number, h: number, copies: number, layout: 'roll' | 'sheet'): Placement[] {
  const n = Math.max(0, Math.floor(copies))
  if (layout === 'roll') return Array.from({ length: n }, (_, i) => ({ page: i, x: 0, y: 0 }))
  const { cols, rows, perPage } = sheetGrid(w, h)
  if (!perPage) return []
  const usedW = cols * w + (cols - 1) * SHEET_GAP
  const usedH = rows * h + (rows - 1) * SHEET_GAP
  const left = (A4.w - usedW) / 2
  const top = (A4.h - usedH) / 2
  return Array.from({ length: n }, (_, i) => {
    const k = i % perPage
    const col = k % cols
    const row = Math.floor(k / cols)
    return { page: Math.floor(i / perPage), x: round(left + (cols - 1 - col) * (w + SHEET_GAP)), y: round(top + row * (h + SHEET_GAP)) }
  })
}

const round = (v: number) => Math.round(v * 100) / 100
