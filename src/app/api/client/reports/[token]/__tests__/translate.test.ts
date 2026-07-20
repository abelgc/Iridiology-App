import { describe, it, expect, vi, beforeEach } from 'vitest'

const VALID_TOKEN = '00000000-0000-4000-8000-000000000000'

let currentRow: Record<string, unknown> = {
  language: 'en',
  status: 'completed',
  payment_tier: 'basic_12',
  reports: {
    id: 'r1',
    report_content: {},
    client_report_content: {
      section_1_general_terrain: 'Your body shows a clear pattern.',
      section_14_recommendations:
        '**Liver**\nVitamins: A, B12, C, E, Niacin\nMinerals: Iron, Potassium\nHerbs: Dandelion root\n\n**Kidneys**\nVitamins: A, B12, C, E\nMinerals: Potassium, Chlorine\nHerbs: Alfalfa',
    },
    client_report_translations: {},
  },
}

let selectResult: any = null
const updateMock = vi.fn().mockReturnValue({
  eq: () => Promise.resolve({ data: null, error: null }),
})

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(selectResult ?? { data: currentRow, error: null }),
        }),
      }),
      update: (...args: unknown[]) => updateMock(...args),
    }),
  }),
}))

const completeMock = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => Promise.resolve({ complete: completeMock }),
}))

function translatedJson(overrides: Record<string, string> = {}) {
  return JSON.stringify({
    section_1_general_terrain: 'Tu cuerpo muestra un patrón claro.',
    ...overrides,
  })
}

beforeEach(() => {
  selectResult = null
  updateMock.mockClear()
  updateMock.mockReturnValue({ eq: () => Promise.resolve({ data: null, error: null }) })
  completeMock.mockReset()
  completeMock.mockResolvedValue({
    text: translatedJson(),
    stopReason: 'end_turn',
  })
  currentRow = {
    language: 'en',
    status: 'completed',
    payment_tier: 'basic_12',
    reports: {
      id: 'r1',
      report_content: {},
      client_report_content: {
        section_1_general_terrain: 'Your body shows a clear pattern.',
        section_14_recommendations:
          '**Liver**\nVitamins: A, B12, C, E, Niacin\nMinerals: Iron, Potassium\nHerbs: Dandelion root\n\n**Kidneys**\nVitamins: A, B12, C, E\nMinerals: Potassium, Chlorine\nHerbs: Alfalfa',
      },
      client_report_translations: {},
    },
  }
})

async function callRoute(token: string, body: unknown) {
  const { POST } = await import('@/app/api/client/reports/[token]/translate/route')
  return POST(
    new Request('http://test', { method: 'POST', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ token }) } as never,
  )
}

describe('POST /api/client/reports/[token]/translate', () => {
  it('returns 400 for an invalid token', async () => {
    const res = await callRoute('not-a-token', { lang: 'es' })
    expect(res.status).toBe(400)
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an unsupported lang value', async () => {
    const res = await callRoute(VALID_TOKEN, { lang: 'fr' })
    expect(res.status).toBe(400)
    expect(completeMock).not.toHaveBeenCalled()
  })

  it("returns the original content untouched and never calls the AI when the requested lang matches the report's own generation language", async () => {
    const res = await callRoute(VALID_TOKEN, { lang: 'en' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.content.section_1_general_terrain).toBe('Your body shows a clear pattern.')
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('returns a cached translation and never calls the AI on a cache hit', async () => {
    ;(currentRow.reports as any).client_report_translations = {
      es: { section_1_general_terrain: 'Ya traducido antes.' },
    }
    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.content.section_1_general_terrain).toBe('Ya traducido antes.')
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('returns 409 not_ready when the analysis is not completed yet', async () => {
    currentRow.status = 'stage2_processing'
    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(res.status).toBe(409)
  })

  it('returns 404 when no client_analyses row matches the token', async () => {
    selectResult = { data: null, error: { message: 'not found' } }
    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(res.status).toBe(404)
  })

  it(
    'REGRESSION: consolidates and tier-filters section_14_recommendations BEFORE translating, so a basic-tier ' +
      "client's translated report can never leak Minerals/Herbs even if the model rewords the English prefixes",
    async () => {
      // Basic tier (set in currentRow) must never see Minerals:/Herbs: content. If translation
      // ran on the RAW pre-consolidation text, the model could reword "Vitamins:"/"Minerals:"/
      // "Herbs:" into the target language, which would silently break
      // consolidateRecommendationsForTier's literal-English-prefix match on any FUTURE render of
      // this cached entry — permanently leaking premium-only content to a basic-tier client.
      await callRoute(VALID_TOKEN, { lang: 'es' })

      expect(completeMock).toHaveBeenCalledTimes(1)
      const sentUserText = completeMock.mock.calls[0][0].userText
      const sentPayload = JSON.parse(sentUserText)
      // Pre-consolidation for basic tier strips Minerals/Herbs entirely, leaving only a
      // "**Vitamins**" grouped block — the AI must never even see the raw Minerals/Herbs lines.
      expect(sentPayload.section_14_recommendations).not.toContain('Minerals')
      expect(sentPayload.section_14_recommendations).not.toContain('Herbs')
      expect(sentPayload.section_14_recommendations).toContain('**Vitamins**')
    },
  )

  it('retries with double max_tokens when the translation response is truncated (stop_reason max_tokens)', async () => {
    completeMock
      .mockResolvedValueOnce({ text: '{"section_1_general_terrain": "cut o', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: translatedJson(), stopReason: 'end_turn' })

    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(res.status).toBe(200)
    expect(completeMock).toHaveBeenCalledTimes(2)
    expect(completeMock.mock.calls[1][0].maxTokens).toBe(12288)
  })

  it('returns a response_too_long-tagged 500 when still truncated after the retry', async () => {
    completeMock.mockResolvedValue({ text: '{"section_1_general_terrain": "still cut', stopReason: 'max_tokens' })
    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/response_too_long/)
  })

  it('persists the translation to reports.client_report_translations on a cache miss', async () => {
    await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(updateMock).toHaveBeenCalledTimes(1)
    const updatePayload = updateMock.mock.calls[0][0]
    expect(updatePayload.client_report_translations.es).toEqual(JSON.parse(translatedJson()))
  })

  it('still returns 200 with the translated content even when the cache-write update fails', async () => {
    updateMock.mockReturnValue({ eq: () => Promise.resolve({ data: null, error: { message: 'db down' } }) })
    const res = await callRoute(VALID_TOKEN, { lang: 'es' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.content.section_1_general_terrain).toBe('Tu cuerpo muestra un patrón claro.')
  })
})
