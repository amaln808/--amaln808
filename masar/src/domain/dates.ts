/** ISO date helpers (yyyy-mm-dd, local calendar, no time zones). */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const todayIso = () => iso(new Date())
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
export const addDays = (s: string, n: number) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
export const monthEnd = (y: number, m0: number) => iso(new Date(y, m0 + 1, 0))
export const minIso = (a: string, b: string) => (a < b ? a : b)
export const maxIso = (a: string, b: string) => (a > b ? a : b)
/** Whole years between two dates, one decimal */
export const yearsBetween = (a: string, b: string) => Math.max(0, Math.round((daysBetween(a, b) / 365.25) * 10) / 10)
