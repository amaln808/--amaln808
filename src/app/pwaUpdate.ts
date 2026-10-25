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

/** Build date and time of the running version, e.g. «25/10/2026 10:41». */
export function buildLabel(): string {
  const d = new Date(__BUILD_TIME__)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
