import { createContext, type ReactNode, useContext, useEffect } from 'react'
import { fetchSettings, type Settings, SETTINGS_KEY } from '../data/settings'
import { type QueryState, useQuery } from '../data/useQuery'
import { applyTheme } from './theme'

const SettingsContext = createContext<QueryState<Settings> | null>(null)

/** Loads the settings row once signed in and applies its colours and text size. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const q = useQuery(SETTINGS_KEY, fetchSettings)
  const s = q.data

  useEffect(() => {
    if (!s) return
    applyTheme({ primary: s.themePrimary, mode: s.themeMode, fontScale: s.fontScale })
  }, [s?.themePrimary, s?.themeMode, s?.fontScale])

  return <SettingsContext.Provider value={q}>{children}</SettingsContext.Provider>
}

export function useSettingsQuery(): QueryState<Settings> {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettingsQuery outside SettingsProvider')
  return ctx
}
