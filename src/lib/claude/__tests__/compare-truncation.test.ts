import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

const mockGetAIProvider = vi.fn()
const mockGetBothProviders = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => mockGetAIProvider(),
  getBothProviders: () => mockGetBothProviders(),
}))

import { compareIris } from '../compare'
import type { ComparisonRequest } from '@/types/claude'

const request: ComparisonRequest = {
  sessionId: 's1',
  patientId: 'p1',
  rightIrisBase64: 'AAA',
  leftIrisBase64: 'BBB',
  previousRightIrisBase64: 'CCC',
  previousLeftIrisBase64: 'DDD',
  previousSessionDate: '2026-01-01',
  patientData: {
    full_name: 'Jane Doe',
    date_of_birth: '1990-01-01',
    gender: null,
    general_history: null,
    symptoms: null,
    practitioner_notes: null,
  },
}

function validComparisonJson(): string {
  return JSON.stringify({
    comp_1_improvements: 'Lymphatic flow has improved since the last session.',
    comp_2_not_improved: 'Hepatic congestion persists at the same level.',
  })
}

beforeEach(() => {
  mockGetAIProvider.mockReset()
  mockGetBothProviders.mockReset().mockResolvedValue(null) // single-provider path by default
})

describe('compareIris — max_tokens truncation handling (single-provider path)', () => {
  it('retries with double max_tokens instead of giving up immediately', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"comp_1_improvements": "cut off half', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const result = await compareIris(request)

    expect('code' in result).toBe(false)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[1][0].maxTokens).toBe(12288)
  })

  it('returns a response_too_long-tagged error when still truncated after the retry', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const result = await compareIris(request)

    expect('code' in result && result.code).toBe('response_too_long')
    expect('message' in result && result.message).toMatch(/^response_too_long: /)
  })
})

describe('compareIris — max_tokens truncation handling (dual-provider path)', () => {
  it('retries a truncated Claude leg with double max_tokens', async () => {
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"comp_1_improvements": "cut off', stopReason: 'max_tokens' }) // leg attempt 1 (truncated)
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' }) // leg retry (succeeds)
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' }) // synthesis
    const openaiComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetBothProviders.mockResolvedValue({
      anthropic: { complete: anthropicComplete },
      openai: { complete: openaiComplete },
    })

    const result = await compareIris(request)

    expect('code' in result).toBe(false)
    expect(anthropicComplete).toHaveBeenCalledTimes(3) // truncated + retry + synthesis
    expect(anthropicComplete.mock.calls[1][0].maxTokens).toBe(12288)
  })

  it('REGRESSION: falls back to Claude-only when the synthesis is truncated twice', async () => {
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' }) // Claude leg
      .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' }) // synthesis attempt
      .mockResolvedValueOnce({ text: 'cut off again', stopReason: 'max_tokens' }) // synthesis retry
    const openaiComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetBothProviders.mockResolvedValue({
      anthropic: { complete: anthropicComplete },
      openai: { complete: openaiComplete },
    })

    const result = await compareIris(request)

    expect('code' in result).toBe(false)
    expect(anthropicComplete).toHaveBeenCalledTimes(3)
  })
})
