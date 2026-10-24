import Dexie, { type EntityTable } from 'dexie'

/** Last server answer for a query, shown when the iPad is offline. */
export interface CachedQuery {
  key: string
  data: unknown
  savedAt: string
}

/**
 * A change made offline, waiting to be sent. `id` is also the id of the record it
 * creates, so sending it twice can never create a duplicate.
 */
export interface OutboxEntry {
  id: string
  op: string
  payload: unknown
  createdAt: string
  attempts: number
  /** 'failed' = the server refused it; needs the user's attention */
  status: 'pending' | 'failed'
  lastError?: string
}

export class LocalDB extends Dexie {
  queries!: EntityTable<CachedQuery, 'key'>
  outbox!: EntityTable<OutboxEntry, 'id'>

  constructor(name = 'zawrda-local') {
    super(name)
    this.version(1).stores({ queries: 'key', outbox: 'id, createdAt, status' })
  }
}

export const local = new LocalDB()

/** Clears everything kept on this device (used on sign-out). */
export async function clearLocal(db: LocalDB = local) {
  await db.transaction('rw', db.queries, db.outbox, async () => {
    await db.queries.clear()
    await db.outbox.clear()
  })
}
