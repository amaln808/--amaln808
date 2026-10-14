import type { BaseRecord } from './types'

/** Adds id and timestamps to a new record. */
export function newRecord<T extends object>(data: T): T & BaseRecord {
  const now = new Date().toISOString()
  return { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
}

export function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
