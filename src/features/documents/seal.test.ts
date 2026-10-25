import { describe, expect, it } from 'vitest'
import { type DocStatus, sealAllowed } from './seal'

describe('sealAllowed', () => {
  it('allows the stamp and signature on an issued invoice only', () => {
    expect(sealAllowed({ kind: 'invoice', status: 'issued' })).toBe(true)
    expect(sealAllowed({ kind: 'invoice', status: 'void' })).toBe(false)
    const quoteStates: DocStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced', 'issued']
    for (const status of quoteStates) expect(sealAllowed({ kind: 'quote', status })).toBe(false)
  })
})
