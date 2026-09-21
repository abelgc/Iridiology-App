import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state: { rows: Record<string, unknown>[]; insertError: { message: string } | null } = {
  rows: [],
  insertError: null,
}

// A real supabase-js query builder is itself a thenable: every chained method (select,
// order, ilike, ...) returns `this`, and `await`-ing the builder resolves { data, error }.
function makeSelectBuilder(): PromiseLike<{ data: unknown; error: null }> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    ilike: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: state.rows, error: null }),
  }
  return builder as PromiseLike<{ data: unknown; error: null }> & Record<string, unknown>
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'patients') throw new Error('unexpected table ' + table)
      return {
        select: () => makeSelectBuilder(),
        insert: (rows: Record<string, unknown>[]) => ({
          select: () => ({
            single: () =>
              state.insertError
                ? Promise.resolve({ data: null, error: state.insertError })
                : Promise.resolve({ data: { id: 'p1', ...rows[0] }, error: null }),
          }),
        }),
      }
    },
  }),
}))

import { GET, POST } from '../route'

function makeGetRequest(search?: string) {
  const url = search ? `http://test/api/patients?search=${search}` : 'http://test/api/patients'
  return new NextRequest(url)
}

function makePostRequest(body: unknown) {
  return new Request('http://test/api/patients', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never
}

describe('GET /api/patients', () => {
  beforeEach(() => {
    state.rows = [{ id: 'p1', full_name: 'Ana' }]
    state.insertError = null
  })

  it('returns the patient list', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual(state.rows)
  })
})

describe('POST /api/patients', () => {
  beforeEach(() => {
    state.rows = []
    state.insertError = null
  })

  it('creates a patient with a valid full_name', async () => {
    const res = await POST(makePostRequest({ full_name: 'Jane Doe' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.full_name).toBe('Jane Doe')
  })

  it('REGRESSION (test/suite-by-topic, 2026-09-21): returns 400 with validation details for an empty full_name, not a generic 500', async () => {
    // patientCreateSchema requires full_name.min(1) — this MUST be a 400 "Validation error",
    // not the catch-all 500. The route's catch block checks `'code' in error &&
    // error.code === 'ZOD_ERROR'`, but Zod's real ZodError has no `.code` property at all
    // (only `.issues`/`.name === 'ZodError'`), so that branch can never match a real
    // validation failure — every bad practitioner input currently looks like a server crash.
    const res = await POST(makePostRequest({ full_name: '' }))
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe('Validation error')
  })

  it('REGRESSION (test/suite-by-topic, 2026-09-21): returns 400, not 500, for an invalid email', async () => {
    const res = await POST(makePostRequest({ full_name: 'Jane Doe', email: 'not-an-email' }))
    const json = await res.json()
    expect(res.status).toBe(400)
  })
})
