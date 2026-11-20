/**
 * «رابط المستند»: a link to the record's PDF kept elsewhere (Google Drive…).
 * Only https links; the same rule is enforced in the database (migration 0025).
 */
export function cleanDocumentUrl(text: string | null | undefined): string | null {
  const s = (text ?? '').trim()
  return s ? s : null
}

export function isValidDocumentUrl(text: string | null | undefined): boolean {
  const s = cleanDocumentUrl(text)
  if (s == null) return true
  if (!/^https:\/\/\S+$/i.test(s)) return false
  try {
    return new URL(s).hostname.includes('.')
  } catch {
    return false
  }
}
