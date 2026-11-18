/** Least-squares line through (i, value) */
export function linearFit(values: number[]) {
  const n = values.length
  const mx = (n - 1) / 2
  const my = values.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  values.forEach((v, i) => {
    num += (i - mx) * (v - my)
    den += (i - mx) ** 2
  })
  const slope = den ? num / den : 0
  return { slope, intercept: my - slope * mx }
}

export interface Forecast {
  value: number
  low: number
  high: number
  /** points per review */
  slope: number
  trend: 'up' | 'down' | 'flat'
  basis: number
}

/**
 * Next-review forecast from past review percents: a damped linear trend
 * (half the slope, since scores regress toward the mean) with a band of ±1.5 residual SD.
 */
export function forecastNext(values: number[]): Forecast | null {
  if (!values.length) return null
  if (values.length === 1) {
    const v = values[0]
    return { value: v, low: Math.max(0, v - 10), high: Math.min(100, v + 10), slope: 0, trend: 'flat', basis: 1 }
  }
  const { slope, intercept } = linearFit(values)
  const n = values.length
  const resid = Math.sqrt(values.reduce((s, v, i) => s + (v - (intercept + slope * i)) ** 2, 0) / Math.max(1, n - 2))
  const last = intercept + slope * (n - 1)
  const value = Math.min(100, Math.max(0, last + slope * 0.5))
  const band = Math.max(3, resid * 1.5)
  const r1 = (x: number) => Math.round(x * 10) / 10
  return {
    value: r1(value),
    low: r1(Math.max(0, value - band)),
    high: r1(Math.min(100, value + band)),
    slope: r1(slope),
    trend: slope > 1 ? 'up' : slope < -1 ? 'down' : 'flat',
    basis: n,
  }
}
