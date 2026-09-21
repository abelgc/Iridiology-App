import { describe, it, expect, vi, beforeEach } from 'vitest'

let sessionsRow: Record<string, unknown> | null
let reportsRow: Record<string, unknown> | null
const insertMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'reports') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: reportsRow, error: reportsRow ? null : new Error('not found') }) }) }) }
      }
      if (table === 'sessions') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: sessionsRow, error: sessionsRow ? null : new Error('not found') }) }) }) }
      }
      if (table === 'report_corrections') {
        return {
          select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ id: 'c1' }], error: null }) }) }),
          insert: (payload: Record<string, unknown>) => {
            insertMock(payload)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'c1', ...payload }, error: null }) }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { GET, POST } from '../route'

function makePostRequest(body: unknown) {
  return new Request('http://test/api/reports/r1/corrections', { method: 'POST', body: JSON.stringify(body) }) as never
}

beforeEach(() => {
  insertMock.mockClear()
  reportsRow = { session_id: 's1' }
  sessionsRow = { patient_id: 'p1' }
})

describe('GET /api/reports/[id]/corrections', () => {
  it('lists corrections for the report', async () => {
    const res = await GET(new Request('http://test') as never, { params: Promise.resolve({ id: 'r1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toHaveLength(1)
  })
})

describe('POST /api/reports/[id]/corrections', () => {
  it('creates a correction, resolving patient_id through the session', async () => {
    const res = await POST(
      makePostRequest({ section_key: 'section_1_general_terrain', original_content: 'a', corrected_content: 'b' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    expect(res.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ report_id: 'r1', patient_id: 'p1' }))
  })

  it('rejects a payload missing corrected_content', async () => {
    const res = await POST(
      makePostRequest({ section_key: 'section_1_general_terrain', original_content: 'a' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when the report does not exist', async () => {
    reportsRow = null
    const res = await POST(
      makePostRequest({ section_key: 'section_1_general_terrain', original_content: 'a', corrected_content: 'b' }),
      { params: Promise.resolve({ id: 'missing' }) },
    )
    expect(res.status).toBe(404)
  })
})
