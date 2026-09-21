import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  row: Record<string, unknown> | null
  selectError: { code?: string; message: string } | null
  updateError: { code?: string; message: string } | null
  deleteError: { message: string } | null
} = { row: null, selectError: null, updateError: null, deleteError: null }

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'patients') throw new Error('unexpected table ' + table)
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              state.selectError
                ? Promise.resolve({ data: null, error: state.selectError })
                : Promise.resolve({ data: state.row, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            select: () => ({
              single: () =>
                state.updateError
                  ? Promise.resolve({ data: null, error: state.updateError })
                  : Promise.resolve({ data: { ...state.row, ...patch }, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () =>
            state.deleteError
              ? Promise.resolve({ error: state.deleteError })
              : Promise.resolve({ error: null }),
        }),
      }
    },
  }),
}))

import { GET, PUT, DELETE } from '../route'

const params = Promise.resolve({ id: 'p1' })

function makeRequest(method: string, body?: unknown) {
  return new Request('http://test/api/patients/p1', {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }) as never
}

describe('GET /api/patients/[id]', () => {
  beforeEach(() => {
    state.row = { id: 'p1', full_name: 'Ana' }
    state.selectError = null
  })

  it('returns the patient', async () => {
    const res = await GET(makeRequest('GET'), { params })
    expect(res.status).toBe(200)
    expect((await res.json()).full_name).toBe('Ana')
  })

  it('returns 404 for a Postgrest "no rows" error', async () => {
    state.selectError = { code: 'PGRST116', message: 'no rows' }
    const res = await GET(makeRequest('GET'), { params })
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/patients/[id]', () => {
  beforeEach(() => {
    state.row = { id: 'p1', full_name: 'Ana' }
    state.updateError = null
  })

  it('updates the patient with valid data', async () => {
    const res = await PUT(makeRequest('PUT', { full_name: 'Ana Updated' }), { params })
    expect(res.status).toBe(200)
    expect((await res.json()).full_name).toBe('Ana Updated')
  })

  it('REGRESSION (test/suite-by-topic, 2026-09-21): returns 400, not 500, when the update payload fails validation (same bug as POST /api/patients — the catch block checks error.code === \'ZOD_ERROR\', which a real ZodError never has)', async () => {
    const res = await PUT(makeRequest('PUT', { email: 'not-an-email' }), { params })
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toBe('Validation error')
  })
})

describe('DELETE /api/patients/[id]', () => {
  it('deletes the patient and returns 204', async () => {
    state.deleteError = null
    const res = await DELETE(makeRequest('DELETE'), { params })
    expect(res.status).toBe(204)
  })

  it('returns 500 with the db error message on delete failure', async () => {
    state.deleteError = { message: 'db exploded' }
    const res = await DELETE(makeRequest('DELETE'), { params })
    expect(res.status).toBe(500)
  })
})
