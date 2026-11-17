import { useState } from 'react'
import type { Scope } from '../domain/performance'

export type ScopeFilter = 'all' | Scope
export const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'work', label: 'عمل' },
  { value: 'personal', label: 'شخصي' },
]

/** The work / personal filter, remembered on this device. */
export function useScopeFilter(): [ScopeFilter, (s: ScopeFilter) => void] {
  const [s, setS] = useState<ScopeFilter>(() => (localStorage.getItem('himma-scope') as ScopeFilter) || 'all')
  return [
    s,
    (v) => {
      localStorage.setItem('himma-scope', v)
      setS(v)
    },
  ]
}

export const inScope = (f: ScopeFilter) => (x: { scope: Scope }) => f === 'all' || x.scope === f
