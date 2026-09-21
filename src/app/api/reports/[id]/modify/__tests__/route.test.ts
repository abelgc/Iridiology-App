import { describe, it, expect, vi, beforeEach } from 'vitest'

let reportsRow: Record<string, unknown> | null
const proposeMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: reportsRow, error: reportsRow ? null : new Error('not found') }) }) }),
    }),
  }),
}))

vi.mock('@/lib/claude/modify-report', () => ({
  proposeReportModification: (...args: unknown[]) => proposeMock(...args),
}))

import { POST } from '../route'

function makeRequest(body: unknown) {
  return new Request('http://test/api/reports/r1/modify', { method: 'POST', body: JSON.stringify(body) }) as never
}

beforeEach(() => {
  proposeMock.mockReset()
  reportsRow = { report_content: { section_1_general_terrain: 'Original.' } }
})

describe('POST /api/reports/[id]/modify', () => {
  it('rejects an empty instruction without calling the model', async () => {
    const res = await POST(makeRequest({ instruction: '   ' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(400)
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the report does not exist', async () => {
    reportsRow = null
    const res = await POST(makeRequest({ instruction: 'make it warmer' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
    expect(proposeMock).not.toHaveBeenCalled()
  })

  it('returns the proposed modification on success', async () => {
    proposeMock.mockResolvedValue({ newContent: { section_1_general_terrain: 'Warmer.' }, changedSections: [] })
    const res = await POST(makeRequest({ instruction: 'make it warmer' }), { params: Promise.resolve({ id: 'r1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.newContent.section_1_general_terrain).toBe('Warmer.')
  })

  it('surfaces a model error as a 422, not a generic 500', async () => {
    proposeMock.mockResolvedValue({ code: 'MODEL_ERROR', message: 'could not parse' })
    const res = await POST(makeRequest({ instruction: 'make it warmer' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(422)
  })
})
