/**
 * What a password-reset email link carries. The link may be pasted as it came
 * (…/auth/v1/verify?token=…&type=recovery), wrapped by a mail app's redirect
 * (google.com/url?q=…), or after it was opened (#access_token=…&refresh_token=…).
 */
export type ResetLink = { kind: 'tokenHash'; tokenHash: string } | { kind: 'session'; accessToken: string; refreshToken: string } | null

export function parseResetLink(text: string): ResetLink {
  let s = text.trim()
  // Undo URL-encoding a few times: mail apps wrap links inside other links
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(s)
      if (d === s) break
      s = d
    } catch {
      break
    }
  }
  const param = (name: string) => s.match(new RegExp(`[?&#]${name}=([A-Za-z0-9._-]+)`))?.[1]
  const access = param('access_token')
  const refresh = param('refresh_token')
  if (access && refresh) return { kind: 'session', accessToken: access, refreshToken: refresh }
  const hash = param('token_hash') ?? param('token')
  return hash ? { kind: 'tokenHash', tokenHash: hash } : null
}
