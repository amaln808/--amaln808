/**
 * Language runtime. The UI language lives in localStorage (read before the first
 * render) and settings.uiLanguage; changing it remounts the app so every t()
 * call re-evaluates. Pure helpers (formatters, services) call t() too.
 */
export type Lang = 'ar' | 'en'
/** Language of a printed document: Arabic, English, or both side by side */
export type DocLang = Lang | 'both'

const KEY = 'uiLanguage'

function initial(): Lang {
  try {
    return (globalThis.localStorage?.getItem(KEY) as Lang) === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

let current: Lang = initial()

export const getLang = (): Lang => current
export const isRTL = (lang: Lang = current) => lang === 'ar'

/** Picks the Arabic or English text for the current (or given) language. */
export function t(ar: string, en: string, lang: Lang = current): string {
  return lang === 'en' ? en : ar
}

export function applyLang(lang: Lang) {
  current = lang
  try {
    globalThis.localStorage?.setItem(KEY, lang)
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.documentElement.dir = isRTL(lang) ? 'rtl' : 'ltr'
  }
}

/** Shows a bilingual record name (items, categories) in the current language. */
export function nameOf(x: { name: string; nameEn?: string | null } | undefined | null, lang: Lang = current): string {
  if (!x) return '—'
  return lang === 'en' && x.nameEn ? x.nameEn : x.name
}
