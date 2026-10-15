/**
 * Chart colors: first three slots of the validated reference palette
 * (checked with the dataviz validator against the white card surface).
 * Blue = money in / revenue, orange = money out / costs, aqua = net.
 * Aqua is under 3:1 contrast, so charts always ship a legend, tooltip and table view.
 */
export const SERIES = {
  in: '#2a78d6',
  out: '#eb6834',
  net: '#1baf7a',
}

export const CHROME = {
  grid: '#e7e5e4',
  axis: '#a8a29e',
  text: '#78716c',
}

/** Axis ticks in whole rials: 12500000 baisa → "12,500" */
export function tickRial(baisa: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(baisa / 1000)
}
