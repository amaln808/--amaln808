import { useMemo } from 'react'
import { useStore } from '../data/store'
import { usePrefs } from '../i18n'

/** Names of departments, positions, people and skills in the current language */
export function useLookups() {
  const { db } = useStore()
  const { lang } = usePrefs()
  return useMemo(() => {
    const ar = lang === 'ar'
    const dep = new Map(db.departments.map((d) => [d.id, ar ? d.name : d.nameEn || d.name]))
    const pos = new Map(db.positions.map((p) => [p.id, ar ? p.title : p.titleEn || p.title]))
    const person = new Map(db.employees.map((e) => [e.id, ar ? e.name : e.nameEn || e.name]))
    const skill = new Map(db.skills.map((s) => [s.id, ar ? s.name : s.nameEn || s.name]))
    return {
      dep: (id: string | null | undefined) => (id ? (dep.get(id) ?? '—') : '—'),
      pos: (id: string) => pos.get(id) ?? '—',
      person: (id: string | null | undefined) => (id ? (person.get(id) ?? '—') : '—'),
      skill: (id: string) => skill.get(id) ?? '—',
      crit: (key: string) => {
        const c = db.org.criteria.find((x) => x.key === key)
        return c ? (ar ? c.ar : c.en) : key
      },
      cycle: (id: string) => {
        const c = db.cycles.find((x) => x.id === id)
        return c ? (ar ? c.name : c.nameEn) : '—'
      },
    }
  }, [db, lang])
}
