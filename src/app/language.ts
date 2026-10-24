import { updateSettings } from '../data/settings'
import { applyLang, type Lang } from '../i18n/index'

const listeners = new Set<(lang: Lang) => void>()

export function onLanguageChange(fn: (lang: Lang) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

/** Switches the UI language; the app remounts so every t() call re-evaluates. */
export function setLanguage(lang: Lang) {
  applyLang(lang)
  listeners.forEach((fn) => fn(lang))
  // Saved to the server too, without blocking (works offline)
  updateSettings({ uiLanguage: lang }).catch(() => {})
}
