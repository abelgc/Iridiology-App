import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalysisRequest } from '@/types/claude'
import type { CompletionResponse } from '@/lib/ai/types'

// Regression test (Ana Iranzo investigation, 2026-09-14): a code-level audit found that when
// getBothProviders() returns null (active_provider !== 'both', or a missing API key), the app
// silently drops from dual-model analysis + synthesis to a single provider with NO log line
// distinguishing it from full dual mode — a real, unlogged infrastructure gap. This asserts a
// clear warning is now emitted so the fallback is visible in production logs.

vi.mock('@/lib/ai/get-provider', () => ({
  getBothProviders: vi.fn(() => Promise.resolve(null)),
  getAIProvider: vi.fn(() => Promise.resolve({ complete: vi.fn() })),
}))

vi.mock('../analyze', () => ({
  analyzeIris: vi.fn(() =>
    Promise.resolve({
      section_1_general_terrain: 'x', section_2_emotional_field: 'x', section_3_cognitive_nervous: 'x',
      section_4_immune_lymphatic: 'x', section_5_endocrine_hormonal: 'x', section_6_circulatory_cardiorespiratory: 'x',
      section_7_hepatic: 'x', section_8_digestive_intestinal: 'x', section_9_renal_urinary: 'x',
      section_10_structural_integumentary: 'x', section_11_detected_axes: 'x', section_12_conclusion: 'x',
      section_13_strengths_of_the_body: 'x', section_14_recommendations: 'x',
    }),
  ),
}))

vi.mock('../rewrite-fixation', () => ({
  guardAgainstSystemFixation: vi.fn((_provider, result) => Promise.resolve(result)),
  guardAgainstHistoryCallbackOveruse: vi.fn((_provider, result) => Promise.resolve(result)),
}))

import { analyzeIrisDual } from '../analyze-dual'

function makeRequest(): AnalysisRequest {
  return {
    sessionId: '',
    patientId: '',
    rightIrisBase64: 'r',
    leftIrisBase64: 'l',
    patientData: {
      full_name: 'Test Patient',
      date_of_birth: null,
      gender: null,
      general_history: null,
      symptoms: null,
      practitioner_notes: null,
    },
    health_questionnaire: null,
  }
}

describe('analyzeIrisDual — silent single-provider fallback logging', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('logs a clear warning when getBothProviders() returns null, instead of silently running single-provider analysis', async () => {
    await analyzeIrisDual(makeRequest(), 'en', {})

    const warned = warnSpy.mock.calls.some((call: unknown[]) =>
      typeof call[0] === 'string' &&
      call[0].includes('falling back to SINGLE-PROVIDER analysis') &&
      call[0].includes('active_provider'),
    )
    expect(warned).toBe(true)
  })
})
