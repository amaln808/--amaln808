import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

declare global {
  const __BUILD_TIME__: string
}

/**
 * A home-screen app on the iPad is often resumed rather than reloaded, so it
 * would keep running an old version. Check for a new one at start and whenever
 * the app comes back to the screen; with autoUpdate the page reloads itself once
 * the new version is installed (changes waiting to be sent stay in the outbox).
 */
export function startPwaUpdates() {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
    },
  })
}

/** Build of the version on the server (version.json is never cached), or null offline / in dev. */
async function serverBuild(): Promise<string | null> {
  try {
    const res = await fetch(new URL('version.json', document.baseURI), { cache: 'no-store' })
    if (!res.ok) return null
    return ((await res.json()) as { build?: string }).build ?? null
  } catch {
    return null
  }
}

/**
 * True when the server has a newer version than the one running. iPadOS does not
 * always let the service worker update a home-screen app, so the app checks by
 * itself: at start, when it comes back to the screen, and every 15 minutes.
 */
export function useNewVersion(): boolean {
  const [newer, setNewer] = useState(false)
  useEffect(() => {
    const check = async () => {
      const b = await serverBuild()
      if (b && b > __BUILD_TIME__) setNewer(true)
    }
    check()
    const onShow = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onShow)
    const timer = setInterval(check, 15 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      clearInterval(timer)
    }
  }, [])
  return newer
}

/**
 * Loads the newest version for sure: drops the stored copy of the app and
 * reloads. Data is untouched (it lives in Supabase, and unsent changes in the
 * on-device outbox, which is not part of the app copy).
 */
export async function forceUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.unregister()))
    const keys = (await caches?.keys()) ?? []
    await Promise.all(keys.map((k) => caches.delete(k)))
  } finally {
    location.reload()
  }
}

/** Build date and time of the running version, e.g. «25/10/2026 10:41». */
export function buildLabel(): string {
  const d = new Date(__BUILD_TIME__)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
