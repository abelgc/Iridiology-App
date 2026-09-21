import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state: { rows: Record<string, unknown>[]; insertError: { message: string } | null } = {
  rows: [],
  insertError: null,
}

function makeSelectBuilder(): PromiseLike<{ data: unknown; error: null }> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: state.rows, error: null }),
  }
  return builder as PromiseLike<{ data: unknown; error: null }> & Record<string, unknown>
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'sessions') throw new Error('unexpected table ' + table)
      return {
        select: () => makeSelectBuilder(),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () =>
              state.insertError
                ? Promise.resolve({ data: null, error: state.insertError })
                : Promise.resolve({ data: { id: 's1', ...row }, error: null }),
          }),
        }),
      }
    },
  }),
}))

import { GET, POST } from '../route'

function makeGetRequest(patientId?: string) {
  const url = patientId ? `http://test/api/sessions?patientId=${patientId}` : 'http://test/api/sessions'
  return new NextRequest(url)
}

function makePostRequest(body: unknown) {
  return new Request('http://test/api/sessions', { method: 'POST', body: JSON.stringify(body) }) as never
}

describe('GET /api/sessions', () => {
  beforeEach(() => {
    state.rows = [{ id: 's1', patient_id: 'p1', analysis_mode: 'standard' }]
  })

  it('lists sessions', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(state.rows)
  })

  it('accepts an optional patientId filter without erroring', async () => {
    const res = await GET(makeGetRequest('p1'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sessions', () => {
  beforeEach(() => {
    state.insertError = null
  })

  it('creates a session with a default status of pending', async () => {
    const res = await POST(makePostRequest({ patient_id: 'p1', analysis_mode: 'standard' }))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.status).toBe('pending')
  })

  it('defaults session_date to today when omitted', async () => {
    const res = await POST(makePostRequest({ patient_id: 'p1', analysis_mode: 'standard' }))
    const json = await res.json()
    expect(json.session_date).toBe(new Date().toISOString().split('T')[0])
  })
})
