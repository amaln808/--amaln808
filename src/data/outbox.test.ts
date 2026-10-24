import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { LocalDB } from './local'
import { enqueue, flushOutbox, registerOutboxHandler, retryFailed } from './outbox'

describe('outbox', () => {
  it('sends queued changes oldest first and removes them', async () => {
    const db = new LocalDB('outbox-order')
    const seen: string[] = []
    registerOutboxHandler<{ n: string }>('order.test', async (p) => {
      seen.push(p.n)
    })
    await enqueue('order.test', { n: 'a' }, 'id-a', db)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue('order.test', { n: 'b' }, 'id-b', db)

    expect(await flushOutbox(db)).toEqual({ sent: 2, failed: 0, waiting: 0 })
    expect(seen).toEqual(['a', 'b'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('stops on a network error and keeps the order for the next try', async () => {
    const db = new LocalDB('outbox-network')
    let online = false
    const seen: string[] = []
    registerOutboxHandler<{ n: string }>('net.test', async (p) => {
      if (!online) throw new TypeError('Failed to fetch')
      seen.push(p.n)
    })
    await enqueue('net.test', { n: '1' }, 'n1', db)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue('net.test', { n: '2' }, 'n2', db)

    expect(await flushOutbox(db)).toEqual({ sent: 0, failed: 0, waiting: 2 })
    expect((await db.outbox.get('n1'))?.attempts).toBe(1)
    expect((await db.outbox.get('n2'))?.attempts).toBe(0)

    online = true
    expect(await flushOutbox(db)).toEqual({ sent: 2, failed: 0, waiting: 0 })
    expect(seen).toEqual(['1', '2'])
  })

  it('sets aside a change the server refuses, without blocking the rest', async () => {
    const db = new LocalDB('outbox-refused')
    registerOutboxHandler<{ ok: boolean }>('refuse.test', async (p) => {
      if (!p.ok) throw new Error('amount must be positive')
    })
    await enqueue('refuse.test', { ok: false }, 'bad', db)
    await new Promise((r) => setTimeout(r, 2))
    await enqueue('refuse.test', { ok: true }, 'good', db)

    expect(await flushOutbox(db)).toEqual({ sent: 1, failed: 1, waiting: 0 })
    const bad = await db.outbox.get('bad')
    expect(bad?.status).toBe('failed')
    expect(bad?.lastError).toBe('amount must be positive')

    await retryFailed('bad', db)
    expect((await db.outbox.get('bad'))?.status).toBe('pending')
  })

  it('passes the entry id so the server record can reuse it (no duplicates on retry)', async () => {
    const db = new LocalDB('outbox-id')
    const ids: string[] = []
    registerOutboxHandler('id.test', async (_p, entry) => {
      ids.push(entry.id)
    })
    await enqueue('id.test', {}, 'fixed-id', db)
    await flushOutbox(db)
    expect(ids).toEqual(['fixed-id'])
  })
})
