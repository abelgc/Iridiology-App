import { describe, it, expect, vi } from 'vitest'

vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

import { analyzeIrisDual } from '../analyze-dual'
import type { AnalysisRequest } from '@/types/claude'

const request: AnalysisRequest = {
  sessionId: 's1',
  patientId: 'p1',
  rightIrisBase64: 'AAA',
  leftIrisBase64: 'BBB',
  patientData: {
    full_name: 'Jane Doe',
    date_of_birth: '1990-01-01',
    gender: null,
    general_history: null,
    symptoms: null,
    practitioner_notes: null,
  },
}

const ALL_15_KEYS = [
  'section_1_general_terrain',
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
  'section_11_detected_axes',
  'section_12_conclusion',
  'section_13_strengths_of_the_body',
  'section_14_recommendations',
  'section_15_iris_sign_patterns',
]

function validReportJson(): string {
  const obj: Record<string, string> = {}
  for (const key of ALL_15_KEYS) obj[key] = `Content for ${key}.`
  return JSON.stringify(obj)
}

describe('analyzeIrisDual — max_tokens truncation handling', () => {
  it('REGRESSION: retries a truncated Claude leg with double max_tokens instead of failing outright', async () => {
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"section_1_general_terrain": "cut off half', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: validReportJson(), stopReason: 'end_turn' })
    const anthropic = { complete: anthropicComplete }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result).toBe(false)
    expect(anthropicComplete).toHaveBeenCalledTimes(3) // truncated attempt + retry + synthesis
    expect(anthropicComplete.mock.calls[1][0].maxTokens).toBe(12288)
  })

  it('REGRESSION (2026-07-19 production incident): falls back to Claude-only when the synthesis response is truncated twice', async () => {
    // Reproduces the exact production shape (Claude leg + OpenAI leg both succeed, synthesis is
    // the one that gets cut off) but via the max_tokens path specifically, complementing the
    // existing "synthesis parse failed" fallback test which covers the trailing-garbage shape.
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: validReportJson(), stopReason: 'end_turn' }) // Claude leg
      .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' }) // synthesis attempt 1
      .mockResolvedValueOnce({ text: 'still cut off again', stopReason: 'max_tokens' }) // synthesis retry
    const anthropic = { complete: anthropicComplete }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    // Falls back to the Claude leg's own (valid) result rather than failing the whole analysis.
    expect('code' in result).toBe(false)
    expect(anthropicComplete).toHaveBeenCalledTimes(3)
  })

  it('fails with a response_too_long-tagged message when the Claude leg is truncated even after the retry', async () => {
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' })
    const anthropic = { complete: anthropicComplete }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result && result.code).toBe('analysis_failed')
    expect('message' in result && result.message).toMatch(/^response_too_long: /)
  })
})
