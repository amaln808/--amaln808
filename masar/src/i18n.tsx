import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { L, Lang } from './domain/types'

export type ThemeMode = 'light' | 'dark' | 'system'
interface Prefs {
  lang: Lang
  setLang: (l: Lang) => void
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  /** t('عربي', 'English') */
  t: (ar: string, en: string) => string
  /** picks the right side of a bilingual value */
  tl: (l: L) => string
  /** a record's display name in the current language */
  nm: (x: { name: string; nameEn?: string }) => string
  num: (n: number, digits?: number) => string
  pct: (x: number | null, digits?: number) => string
  date: (iso: string) => string
}
const Ctx = createContext<Prefs | null>(null)

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('masar-lang') as Lang) || 'ar')
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem('masar-theme') as ThemeMode) || 'system')
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSystemDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    localStorage.setItem('masar-lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])
  useEffect(() => {
    localStorage.setItem('masar-theme', theme)
    const dark = theme === 'dark' || (theme === 'system' && systemDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0a2c31' : '#0e3f47')
  }, [theme, systemDark])

  const value = useMemo<Prefs>(() => {
    // Western digits in both languages: they read the same in tables and exports
    const nf = (d: number) => new Intl.NumberFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { maximumFractionDigits: d })
    const df = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    return {
      lang,
      setLang,
      theme,
      setTheme,
      t: (ar, en) => (lang === 'ar' ? ar : en),
      tl: (l) => l[lang],
      nm: (x) => (lang === 'en' && x.nameEn ? x.nameEn : x.name),
      num: (n, d = 1) => nf(d).format(n),
      pct: (x, d = 0) => (x == null ? '—' : `${nf(d).format(x * 100)}%`),
      date: (s) => {
        const [y, m, d] = s.split('-').map(Number)
        return df.format(new Date(y, m - 1, d))
      },
    }
  }, [lang, theme])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePrefs() {
  const p = useContext(Ctx)
  if (!p) throw new Error('PrefsProvider missing')
  return p
}
