/** "2026-10-14" → "14/10/2026" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.name === 'UserError') return e.message
  console.error(e)
  return 'حدث خطأ غير متوقع، حاول مرة أخرى'
}
