import { describe, it, expect, vi, beforeEach } from 'vitest'

type Query = { table: string; ops: Array<[string, unknown[]]> }

const BUILDER_METHODS = ['select', 'eq', 'is', 'gte', 'insert'] as const

let queries: Query[] = []
let respond: (q: Query) => unknown

function createStubClient() {
  return {
    from(table: string) {
      const query: Query = { table, ops: [] }
      queries.push(query)
      const builder: Record<string, unknown> = {}
      for (const method of BUILDER_METHODS) {
        builder[method] = (...args: unknown[]) => {
          query.ops.push([method, args])
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => respond(query))
          .then(resolve, reject)
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => createStubClient()),
}))

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null })

vi.mock('resend', () => ({
  // `new Resend(...)` requires a constructible mock — an arrow function can't be `new`'d.
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: sendMock } }
  }),
}))

import { logAppError } from '../error-log'

let dedupCount = 0
let insertError: { message: string } | null = null

function defaultResponder(q: Query): unknown {
  if (q.table !== 'app_errors') throw new Error(`unexpected table ${q.table}`)
  const isInsert = q.ops.some(([n]) => n === 'insert')
  if (isInsert) return { error: insertError }
  return { count: dedupCount, error: null }
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.RESEND_FROM_EMAIL = 'alerts@example.com'
  process.env.HEALTH_ALERT_EMAIL = 'admin@example.com'
  queries = []
  dedupCount = 0
  insertError = null
  respond = defaultResponder
  sendMock.mockClear()
})

describe('logAppError', () => {
  it('inserts a row and alerts on the first occurrence in the window', async () => {
    await logAppError({ source: 'server', route: '/api/foo', message: 'boom' })

    const insertQuery = queries.find((q) => q.ops.some(([n]) => n === 'insert'))
    expect(insertQuery).toBeDefined()
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].subject).toContain('/api/foo')
    expect(sendMock.mock.calls[0][0].subject).toContain('boom')
  })

  it('does not alert again for a repeat of the same route+message inside the window', async () => {
    dedupCount = 1

    await logAppError({ source: 'server', route: '/api/foo', message: 'boom' })

    expect(sendMock).not.toHaveBeenCalled()
    // Still inserted — dedup only gates the alert, not the record.
    expect(queries.some((q) => q.ops.some(([n]) => n === 'insert'))).toBe(true)
  })

  it('uses is(route, null) rather than eq for client errors with no route', async () => {
    await logAppError({ source: 'client', route: null, message: 'oops' })

    const dedupQuery = queries.find((q) => q.ops.some(([n]) => n === 'is'))
    expect(dedupQuery).toBeDefined()
    expect(dedupQuery!.ops.find(([n]) => n === 'is')?.[1]).toEqual(['route', null])
  })

  it('still inserts the row even when alerting is not configured', async () => {
    delete process.env.HEALTH_ALERT_EMAIL

    await logAppError({ source: 'client', route: null, message: 'oops' })

    expect(queries.some((q) => q.ops.some(([n]) => n === 'insert'))).toBe(true)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('swallows an insert failure without throwing and does not alert', async () => {
    insertError = { message: 'permission denied' }

    await expect(logAppError({ source: 'server', route: '/x', message: 'y' })).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('never throws even if the query itself blows up', async () => {
    respond = () => {
      throw new Error('network down')
    }

    await expect(logAppError({ source: 'edge', route: '/x', message: 'y' })).resolves.toBeUndefined()
  })
})
