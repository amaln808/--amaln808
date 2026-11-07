import { describe, expect, it } from 'vitest'
import { parseResetLink } from './resetLink'

const hash = '3f1c2a9be0d44c7a8b55e1f0c2d3a4b5c6d7e8f90a1b2c3d4e5f6a7b'

describe('reading a password-reset link', () => {
  it('takes the token from the link in the email', () => {
    expect(parseResetLink(`https://abc.supabase.co/auth/v1/verify?token=${hash}&type=recovery&redirect_to=https://x.dev/`)).toEqual({ kind: 'tokenHash', tokenHash: hash })
    expect(parseResetLink(`  https://x.dev/?token_hash=${hash}&type=recovery `)).toEqual({ kind: 'tokenHash', tokenHash: hash })
  })

  it('looks inside a link wrapped by the mail app', () => {
    const inner = encodeURIComponent(`https://abc.supabase.co/auth/v1/verify?token=${hash}&type=recovery`)
    expect(parseResetLink(`https://www.google.com/url?q=${inner}&sa=D`)).toEqual({ kind: 'tokenHash', tokenHash: hash })
  })

  it('accepts the address after the link was opened', () => {
    expect(parseResetLink('https://amaln808.github.io/--amaln808/#access_token=eyJ.a.b&expires_in=3600&refresh_token=r1x&type=recovery')).toEqual({
      kind: 'session',
      accessToken: 'eyJ.a.b',
      refreshToken: 'r1x',
    })
  })

  it('says so when there is nothing to use', () => {
    expect(parseResetLink('hello')).toBeNull()
    expect(parseResetLink('')).toBeNull()
  })
})
