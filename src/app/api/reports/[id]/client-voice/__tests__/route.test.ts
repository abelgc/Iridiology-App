import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentReportRow: any
let updatePayloads: any[] = []

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => chain({ data: currentReportRow, error: null }),
      update: (payload: any) => {
        updatePayloads.push(payload)
        return chain({ data: { id: 'r1' }, error: null })
      },
    }),
  }),
}))

const mockRewrite = vi.fn()
vi.mock('@/lib/client/writing-pipeline', () => ({
  rewriteReportForClient: (...args: any[]) => mockRewrite(...args),
  firstNameFrom: (fullName: string | null) => {
    const trimmed = fullName?.trim()
    return trimmed ? trimmed.split(/\s+/)[0] : ''
  },
}))

import { POST } from '../route'

const baseReportContent = {
  section_1_general_terrain: 'Clinical terrain text.',
  section_2_emotional_field: 'Clinical emotional text.',
  section_15_iris_sign_patterns: 'Radii Solaris pattern — practitioner only.',
}

function makeRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as any
}

describe('POST /api/reports/[id]/client-voice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updatePayloads = []
    currentReportRow = {
      id: 'r1',
      report_content: baseReportContent,
      client_report_translations: {},
    }
  })

  it('returns 400 for an invalid language', async () => {
    const res = await POST(makeRequest({ lang: 'fr' }), { params: Promise.resolve({ id: 'r1' }) })
    expect(res.status).toBe(400)
    expect(mockRewrite).not.toHaveBeenCalled()
  })

  it('returns 404 when the report does not exist', async () => {
    currentReportRow = null
    const res = await POST(makeRequest({ lang: 'en' }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('calls rewriteReportForClient on a cache miss, strips section 15 from the input, and persists the result', async () => {
    mockRewrite.mockResolvedValue({
      section_1_general_terrain: 'Client-voice terrain text.',
      section_2_emotional_field: 'Client-voice emotional text.',
    })

    const res = await POST(
      makeRequest({ lang: 'en', fullName: 'Jane Doe' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    const body = await res.json()

    expect(mockRewrite).toHaveBeenCalledTimes(1)
    const [sourcePassedIn, langPassedIn, firstNamePassedIn] = mockRewrite.mock.calls[0]
    expect(sourcePassedIn.section_15_iris_sign_patterns).toBeUndefined()
    expect(langPassedIn).toBe('en')
    expect(firstNamePassedIn).toBe('Jane')

    expect(updatePayloads).toHaveLength(1)
    expect(updatePayloads[0].client_report_translations.en).toEqual({
      section_1_general_terrain: 'Client-voice terrain text.',
      section_2_emotional_field: 'Client-voice emotional text.',
    })

    expect(body.markdown).toContain('Client-voice terrain text.')
    expect(body.markdown).not.toContain('Radii Solaris')
  })

  it('returns cached content on a hit without calling rewriteReportForClient again', async () => {
    currentReportRow.client_report_translations = {
      es: {
        section_1_general_terrain: 'Texto ya traducido.',
        section_2_emotional_field: 'Texto emocional ya traducido.',
      },
    }

    const res = await POST(
      makeRequest({ lang: 'es', fullName: 'Jane Doe' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    const body = await res.json()

    expect(mockRewrite).not.toHaveBeenCalled()
    expect(updatePayloads).toHaveLength(0)
    expect(body.markdown).toContain('Texto ya traducido.')
  })

  it('localizes section headers per the requested language', async () => {
    currentReportRow.client_report_translations = {
      es: { section_1_general_terrain: 'Texto.' },
    }
    const res = await POST(
      makeRequest({ lang: 'es' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    const body = await res.json()
    expect(body.markdown).toContain('## Terreno General')
  })
})
