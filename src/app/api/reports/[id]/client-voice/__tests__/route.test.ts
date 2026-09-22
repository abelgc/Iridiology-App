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
const TEST_PROMPT_VERSION = 'v-test-abc123'
vi.mock('@/lib/client/writing-pipeline', () => ({
  rewriteReportForClient: (...args: any[]) => mockRewrite(...args),
  firstNameFrom: (fullName: string | null) => {
    const trimmed = fullName?.trim()
    return trimmed ? trimmed.split(/\s+/)[0] : ''
  },
  currentPromptVersion: () => TEST_PROMPT_VERSION,
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
    expect(updatePayloads[0].client_report_translations[`en::${TEST_PROMPT_VERSION}`]).toEqual({
      section_1_general_terrain: 'Client-voice terrain text.',
      section_2_emotional_field: 'Client-voice emotional text.',
    })

    expect(body.markdown).toContain('Client-voice terrain text.')
    expect(body.markdown).not.toContain('Radii Solaris')
  })

  it('returns cached content on a hit without calling rewriteReportForClient again', async () => {
    currentReportRow.client_report_translations = {
      [`es::${TEST_PROMPT_VERSION}`]: {
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
      [`es::${TEST_PROMPT_VERSION}`]: { section_1_general_terrain: 'Texto.' },
    }
    const res = await POST(
      makeRequest({ lang: 'es' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    const body = await res.json()
    expect(body.markdown).toContain('## Terreno General')
  })

  it("REGRESSION (Jitamitra report, 2026-09-22): a cache entry written under the old plain-language key (from before the prompt changed) is NOT served — it regenerates instead of returning stale content", async () => {
    // Reproduces the actual incident: this report's 'en' cache was written at 11:21, the
    // KNOWN DIAGNOSES prompt fix shipped at 16:29, and re-generating the handout at 16:33
    // still returned the pre-fix text byte-for-byte, because the old code only ever checked
    // `existingTranslations[lang]` — a plain key with no idea which prompt version wrote it.
    currentReportRow.client_report_translations = {
      en: {
        section_1_general_terrain: 'Stale pre-fix text with the old doctor-referral line.',
      },
    }
    mockRewrite.mockResolvedValue({
      section_1_general_terrain: 'Freshly regenerated text.',
      section_2_emotional_field: 'Freshly regenerated text 2.',
    })

    const res = await POST(
      makeRequest({ lang: 'en', fullName: 'Jane Doe' }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    const body = await res.json()

    expect(mockRewrite).toHaveBeenCalledTimes(1)
    expect(body.markdown).toContain('Freshly regenerated text.')
    expect(body.markdown).not.toContain('Stale pre-fix text')
  })
})
