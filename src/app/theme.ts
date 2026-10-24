import type { FontScale, ThemeMode } from '../data/settings'

export interface Theme {
  primary: string
  mode: ThemeMode
  fontScale: FontScale
}

export const DEFAULT_THEME: Theme = { primary: '#6b5433', mode: 'system', fontScale: 'md' }

/** Ready-made main colours offered in settings (any colour can still be picked). */
export const BRAND_SWATCHES = ['#6b5433', '#8a4b2a', '#3f5f45', '#2f5a6e', '#5b4170', '#7a2e3a']

const KEY = 'zawrda-theme'

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Light text on dark colours, dark text on light ones (always ≥ 4.5:1 where possible). */
export function textOn(hex: string): string {
  const L = luminance(hex)
  const light = (1.0 + 0.05) / (L + 0.05)
  const dark = (L + 0.05) / (luminance('#1f1d19') + 0.05)
  return light >= dark ? '#fbf8f2' : '#1f1d19'
}

let media: MediaQueryList | null = null
let current: Theme = DEFAULT_THEME

function resolveDark(mode: ThemeMode) {
  return mode === 'dark' || (mode === 'system' && !!media?.matches)
}

/** Applies colours, dark mode and text size to <html> and remembers them for the next start. */
export function applyTheme(theme: Theme) {
  current = theme
  const root = document.documentElement
  const primary = /^#[0-9a-f]{6}$/i.test(theme.primary) ? theme.primary : DEFAULT_THEME.primary
  root.style.setProperty('--brand', primary)
  root.style.setProperty('--on-brand', textOn(primary))
  root.dataset.theme = resolveDark(theme.mode) ? 'dark' : 'light'
  root.dataset.font = theme.fontScale
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary)
  try {
    localStorage.setItem(KEY, JSON.stringify(theme))
  } catch {
    /* private mode */
  }
}

/** Called before the first render so the app never flashes the wrong colours. */
export function initTheme() {
  media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  media?.addEventListener?.('change', () => applyTheme(current))
  let saved: Theme = DEFAULT_THEME
  try {
    saved = { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    /* ignore */
  }
  applyTheme(saved)
}
