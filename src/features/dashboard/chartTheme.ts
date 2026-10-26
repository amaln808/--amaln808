/**
 * Chart colors: the first three slots of the dataviz reference palette, as CSS
 * tokens in src/index.css so light and dark each use their own validated steps.
 * Blue = money in / revenue, orange = money out / costs, aqua = net.
 * Aqua is under 3:1 on white, so charts always ship a legend, tooltip and table view.
 */
export const SERIES = {
  in: 'var(--viz-in)',
  out: 'var(--viz-out)',
  net: 'var(--viz-net)',
}

export const CHROME = {
  grid: 'var(--line)',
  axis: 'var(--line)',
  text: 'var(--muted)',
}

/** Axis ticks in whole rials: 12500000 baisa → "12,500" */
export function tickRial(baisa: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(baisa / 1000)
}
