import { useMemo } from 'react'
import { type Agreement, fetchSchedule, SCHEDULE_KEY, type Task, todayIso } from '../../data/schedule'
import { useQuery } from '../../data/useQuery'
import { agreementStatus, type DueItem, dueToday } from '../../domain/schedule'

export interface AgreementAlert {
  agreement: Agreement
  status: 'expiring' | 'expired'
  daysLeft: number
}

/** Agreements that need attention: expired, or inside their alert window. Renewed ones are history. */
export function agreementAlerts(agreements: Agreement[], today: string): AgreementAlert[] {
  return agreements
    .filter((a) => a.active)
    .map((a) => ({ agreement: a, ...agreementStatus(a, today) }))
    .filter((x): x is AgreementAlert => x.status !== 'active')
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Shared by the "My tasks" icon and the tasks/agreements pages. */
export function useSchedule() {
  const q = useQuery(SCHEDULE_KEY, fetchSchedule)
  const today = todayIso()
  const derived = useMemo(() => {
    const data = q.data
    if (!data) return { today: [] as DueItem<Task>[], alerts: [] as AgreementAlert[], doneKeys: new Set<string>() }
    const doneKeys = new Set(data.done)
    return { today: dueToday(data.tasks, doneKeys, today), alerts: agreementAlerts(data.agreements, today), doneKeys }
  }, [q.data, today])
  const openCount = derived.today.filter((i) => !i.done).length + derived.alerts.length
  return { ...q, ...derived, todayDate: today, openCount }
}
