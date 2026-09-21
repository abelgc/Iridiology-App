import { describe, it, expect, vi, beforeEach } from 'vitest'
import { REPORT_SECTION_KEYS } from '@/types/report'

function fullReportContent(overrides: Record<string, string> = {}) {
  const content: Record<string, string> = {}
  for (const key of REPORT_SECTION_KEYS) content[key] = `Content for ${key}.`
  return { ...content, ...overrides }
}

let currentRow: Record<string, unknown>
const updateMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'reports') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: currentRow, error: null }) }),
        }),
        update: (payload: Record<string, unknown>) => {
          updateMock(payload)
          currentRow = { ...currentRow, ...payload }
          return {
            eq: () => ({
              select: () => ({ single: () => Promise.resolve({ data: currentRow, error: null }) }),
            }),
          }
        },
      }
    },
  }),
}))

import { GET, PUT } from '../route'

function makeGetRequest() {
  return new Request('http://test/api/reports/r1') as never
}

function makePutRequest(body: unknown) {
  return new Request('http://test/api/reports/r1', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  updateMock.mockClear()
  currentRow = {
    id: 'r1',
    report_content: fullReportContent(),
    is_edited: false,
    client_report_translations: {
      es: fullReportContent({ section_1_general_terrain: 'Contenido cliente en español (cache).' }),
    },
  }
})

describe('GET /api/reports/[id]', () => {
  it('returns the report row', async () => {
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'r1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.id).toBe('r1')
  })

  it('returns 404 when the report does not exist', async () => {
    currentRow = null as unknown as Record<string, unknown>
    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/reports/[id]', () => {
  it('persists the edited report_content and marks is_edited true', async () => {
    const edited = fullReportContent({ section_1_general_terrain: 'Edited text.' })
    const res = await PUT(makePutRequest({ report_content: edited }), { params: Promise.resolve({ id: 'r1' }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.report_content.section_1_general_terrain).toBe('Edited text.')
    expect(json.is_edited).toBe(true)
  })

  it('rejects a payload missing a required section', async () => {
    const incomplete = fullReportContent()
    delete incomplete.section_2_emotional_field
    const res = await PUT(makePutRequest({ report_content: incomplete }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(400)
  })

  it('REGRESSION: editing report_content invalidates the cached client_report_translations, so the client-voice handout regenerates instead of silently serving stale content', async () => {
    const edited = fullReportContent({ section_1_general_terrain: 'Edited after cache was warm.' })
    await PUT(makePutRequest({ report_content: edited }), { params: Promise.resolve({ id: 'r1' }) })

    // The 'es' cache from beforeEach is now stale relative to the just-edited English
    // source — the Planner-built brief it was generated from no longer reflects the
    // report. The PUT must clear it so client-voice regenerates on next request instead
    // of trusting its unconditional cache-hit path (client-voice/route.ts: `if (cached) {
    // clientContent = cached }`, which has no version/staleness check of its own).
    const putPayload = updateMock.mock.calls[0][0]
    expect(putPayload.client_report_translations).toEqual({})

    const res = await GET(makeGetRequest(), { params: Promise.resolve({ id: 'r1' }) })
    const json = await res.json()
    expect(json.client_report_translations).toEqual({})
  })
})
