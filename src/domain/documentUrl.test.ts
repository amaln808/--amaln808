import { describe, expect, it } from 'vitest'
import { cleanDocumentUrl, isValidDocumentUrl } from './documentUrl'

describe('document link', () => {
  it('empty means no link', () => {
    expect(cleanDocumentUrl('   ')).toBeNull()
    expect(cleanDocumentUrl(null)).toBeNull()
    expect(isValidDocumentUrl('')).toBe(true)
  })

  it('accepts https links, trimmed', () => {
    expect(cleanDocumentUrl('  https://drive.google.com/file/d/1AbC/view  ')).toBe('https://drive.google.com/file/d/1AbC/view')
    expect(isValidDocumentUrl('https://drive.google.com/file/d/1AbC/view?usp=sharing')).toBe(true)
    expect(isValidDocumentUrl('HTTPS://docs.google.com/x')).toBe(true)
  })

  it('refuses anything that is not an https link', () => {
    for (const bad of ['http://drive.google.com/x', 'drive.google.com/x', 'javascript:alert(1)', 'https://a b', 'https://', 'https://localhost'])
      expect(isValidDocumentUrl(bad)).toBe(false)
  })
})
