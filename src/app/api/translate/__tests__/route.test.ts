import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAIProvider = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => mockGetAIProvider(),
}))

const reportRow = { report_content: { section_1_general_terrain: 'Original English content.' } }
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: reportRow, error: null }) }),
      }),
    }),
  }),
}))

import { POST } from '../route'

function makeRequest(body: unknown) {
  return new Request('http://test/api/translate', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  mockGetAIProvider.mockReset()
})

describe('POST /api/translate — max_tokens truncation handling', () => {
  it('REGRESSION: retries with double max_tokens when the response is truncated, instead of failing on a cut-off JSON', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"section_1_general_terrain": "cont', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({
        text: JSON.stringify({ section_1_general_terrain: 'Contenido traducido completo.' }),
        stopReason: 'end_turn',
      })
    mockGetAIProvider.mockResolvedValue({ complete })

    const res = await POST(makeRequest({ reportId: 'r1', targetLang: 'es' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[1][0].maxTokens).toBe(12288)
    expect(json.content.section_1_general_terrain).toBe('Contenido traducido completo.')
  })

  it('returns a 500 with a response_too_long-tagged error when still truncated after the retry', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const res = await POST(makeRequest({ reportId: 'r1', targetLang: 'es' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toMatch(/^response_too_long: /)
  })

  it('does not retry when the response completes normally', async () => {
    const complete = vi.fn().mockResolvedValueOnce({
      text: JSON.stringify({ section_1_general_terrain: 'Contenido traducido.' }),
      stopReason: 'end_turn',
    })
    mockGetAIProvider.mockResolvedValue({ complete })

    const res = await POST(makeRequest({ reportId: 'r1', targetLang: 'es' }))

    expect(res.status).toBe(200)
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
