import { describe, expect, it } from 'vitest'
import { all, PAGE_SIZE } from './client'

/** A stand-in query that, like Supabase, never answers more than PAGE_SIZE rows. */
function fakeQuery(total: number, calls: Array<[number, number, string]>) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  let key = ''
  const q = {
    order(column: string) {
      key = column
      return q
    },
    range(from: number, to: number) {
      calls.push([from, to, key])
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null })
    },
  }
  return q
}

describe('all rows of a list', () => {
  it('reads past the 1000-row cap, page by page, ordered by id', async () => {
    const calls: Array<[number, number, string]> = []
    const { data, error } = await all(() => fakeQuery(2500, calls))
    expect(error).toBeNull()
    expect(data).toHaveLength(2500)
    expect(new Set(data.map((r: { id: number }) => r.id)).size).toBe(2500)
    expect(calls).toEqual([[0, 999, 'id'], [1000, 1999, 'id'], [2000, 2999, 'id']])
  })

  it('a small table is one request', async () => {
    const calls: Array<[number, number, string]> = []
    const { data } = await all(() => fakeQuery(12, calls))
    expect(data).toHaveLength(12)
    expect(calls).toHaveLength(1)
  })

  it('passes the error on', async () => {
    const boom = { order: () => boom, range: () => Promise.resolve({ data: null, error: { message: 'x' } }) }
    const { error } = await all(() => boom)
    expect(error).toEqual({ message: 'x' })
  })
})
