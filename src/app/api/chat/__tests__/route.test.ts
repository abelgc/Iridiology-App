import { describe, it, expect, vi, beforeEach } from 'vitest'

let reportsRow: Record<string, unknown> | null
let sessionsRow: Record<string, unknown> | null
let patientsRow: Record<string, unknown> | null
let settingsRow: Record<string, unknown> | null

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const rowFor: Record<string, Record<string, unknown> | null> = {
        reports: reportsRow,
        sessions: sessionsRow,
        patients: patientsRow,
        settings: settingsRow,
      }
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: rowFor[table], error: rowFor[table] ? null : new Error('not found') }) }),
        }),
      }
    },
  }),
}))

async function* fakeGenerator(tokens: string[]) {
  for (const t of tokens) yield t
}

const chatMock = vi.fn()
vi.mock('@/lib/claude/chat', () => ({
  chatAboutReport: (...args: unknown[]) => chatMock(...args),
}))

import { POST } from '../route'

function makeRequest(body: unknown) {
  return new Request('http://test/api/chat', { method: 'POST', body: JSON.stringify(body) }) as never
}

async function readSSE(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value)
  }
  return out
}

beforeEach(() => {
  chatMock.mockReset()
  reportsRow = { id: 'r1', session_id: 's1', report_content: { section_1_general_terrain: 'x' } }
  sessionsRow = { patient_id: 'p1' }
  patientsRow = { full_name: 'Jane Doe', date_of_birth: '1990-01-01', gender: 'female' }
  settingsRow = { value: 'sk-ant-fake' }
})

describe('POST /api/chat', () => {
  it('streams tokens as SSE then sends done:true', async () => {
    chatMock.mockReturnValue(fakeGenerator(['Hola', ' mundo']))
    const res = await POST(makeRequest({ reportId: 'r1', message: 'hi', chatHistory: [] }))
    const body = await readSSE(res)
    expect(body).toContain('"token":"Hola"')
    expect(body).toContain('"token":" mundo"')
    expect(body).toContain('"done":true')
  })

  it('returns 404 when the report does not exist', async () => {
    reportsRow = null
    const res = await POST(makeRequest({ reportId: 'missing', message: 'hi', chatHistory: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the session does not exist', async () => {
    sessionsRow = null
    const res = await POST(makeRequest({ reportId: 'r1', message: 'hi', chatHistory: [] }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the patient does not exist', async () => {
    patientsRow = null
    const res = await POST(makeRequest({ reportId: 'r1', message: 'hi', chatHistory: [] }))
    expect(res.status).toBe(404)
  })

  it('sends an SSE error event instead of crashing when the generator throws mid-stream', async () => {
    async function* throwing() {
      yield 'partial'
      throw new Error('model exploded')
    }
    chatMock.mockReturnValue(throwing())
    const res = await POST(makeRequest({ reportId: 'r1', message: 'hi', chatHistory: [] }))
    const body = await readSSE(res)
    expect(body).toContain('"token":"partial"')
    expect(body).toContain('"error":"model exploded"')
  })
})
