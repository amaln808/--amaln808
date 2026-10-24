import { isNetworkError } from './client'
import { local, type LocalDB, type OutboxEntry } from './local'

/**
 * Sends one queued change to the server. Must be idempotent: create records with
 * `entry.id` as their id and ignore duplicates, so a retry after a lost reply is safe.
 */
export type OutboxHandler = (payload: never, entry: OutboxEntry) => Promise<void>

const handlers = new Map<string, OutboxHandler>()

export function registerOutboxHandler<P>(op: string, handler: (payload: P, entry: OutboxEntry) => Promise<void>) {
  handlers.set(op, handler as OutboxHandler)
}

export async function enqueue(op: string, payload: unknown, id: string = crypto.randomUUID(), db: LocalDB = local) {
  await db.outbox.add({ id, op, payload, createdAt: new Date().toISOString(), attempts: 0, status: 'pending' })
  return id
}

export interface FlushResult {
  sent: number
  failed: number
  /** Still waiting because the connection dropped */
  waiting: number
}

let flushing: Promise<FlushResult> | null = null

/**
 * Sends waiting changes oldest first. Stops at the first network error (try again
 * later, order kept); a change the server refuses is set aside as 'failed'.
 */
export function flushOutbox(db: LocalDB = local): Promise<FlushResult> {
  flushing ??= run(db).finally(() => (flushing = null))
  return flushing
}

async function run(db: LocalDB): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, waiting: 0 }
  const pending = await db.outbox.where('status').equals('pending').sortBy('createdAt')
  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i]
    const handler = handlers.get(entry.op)
    try {
      if (!handler) throw new Error(`No handler for ${entry.op}`)
      await handler(entry.payload as never, entry)
      await db.outbox.delete(entry.id)
      result.sent++
    } catch (err) {
      if (handler && isNetworkError(err)) {
        await db.outbox.update(entry.id, { attempts: entry.attempts + 1 })
        result.waiting = pending.length - i
        break
      }
      await db.outbox.update(entry.id, {
        attempts: entry.attempts + 1,
        status: 'failed',
        lastError: String((err as Error)?.message ?? err),
      })
      result.failed++
    }
  }
  return result
}

/** Puts a refused change back in the queue (after the user fixed the cause). */
export async function retryFailed(id: string, db: LocalDB = local) {
  await db.outbox.update(id, { status: 'pending', lastError: undefined })
}

export async function discardEntry(id: string, db: LocalDB = local) {
  await db.outbox.delete(id)
}

/** Flushes on start-up, whenever the connection returns, and every minute. */
export function startOutboxSync() {
  const tick = () => {
    if (navigator.onLine) flushOutbox().catch(() => {})
  }
  tick()
  window.addEventListener('online', tick)
  const timer = window.setInterval(tick, 60_000)
  return () => {
    window.removeEventListener('online', tick)
    window.clearInterval(timer)
  }
}
