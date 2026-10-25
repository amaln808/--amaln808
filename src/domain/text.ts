/**
 * Comparison key for names typed by hand: ignores case, extra spaces, tashkeel,
 * tatweel and the common hamza / taa marbuta / alif maqsura spelling variants.
 */
export function nameKey(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Distinct non-empty values in first-seen order, merging spelling variants. */
export function distinctNames(values: Array<string | null | undefined>): string[] {
  const seen = new Map<string, string>()
  for (const v of values) {
    const s = v?.trim()
    if (s && !seen.has(nameKey(s))) seen.set(nameKey(s), s)
  }
  return [...seen.values()]
}
