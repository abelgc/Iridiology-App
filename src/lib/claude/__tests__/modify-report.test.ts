import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAIProvider = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => mockGetAIProvider(),
}))

import { proposeReportModification } from '../modify-report'
import type { ReportContent } from '@/types/report'

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

function baseReport(): ReportContent {
  const obj: Record<string, string> = {}
  for (const key of ALL_15_KEYS) obj[key] = `Original content for ${key}.`
  return obj as ReportContent
}

function modifiedReportJson(): string {
  const obj: Record<string, string> = {}
  for (const key of ALL_15_KEYS) obj[key] = `Modified content for ${key}.`
  return JSON.stringify(obj)
}

beforeEach(() => {
  mockGetAIProvider.mockReset()
})

describe('proposeReportModification — max_tokens truncation handling', () => {
  it('REGRESSION: retries with double max_tokens when the response is truncated, instead of failing on a cut-off JSON', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"section_1_general_terrain": "cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: modifiedReportJson(), stopReason: 'end_turn' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const result = await proposeReportModification(baseReport(), 'make it warmer')

    expect('code' in result).toBe(false)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[1][0].maxTokens).toBe(12288)
    if (!('code' in result)) {
      expect(result.newContent.section_1_general_terrain).toBe('Modified content for section_1_general_terrain.')
      expect(result.changedSections.length).toBeGreaterThan(0)
    }
  })

  it('returns a response_too_long-tagged modification_failed error when still truncated after the retry', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const result = await proposeReportModification(baseReport(), 'make it warmer')

    expect('code' in result && result.code).toBe('modification_failed')
    expect('message' in result && result.message).toMatch(/^response_too_long: /)
  })

  it('does not retry when the response completes normally', async () => {
    const complete = vi.fn().mockResolvedValueOnce({ text: modifiedReportJson(), stopReason: 'end_turn' })
    mockGetAIProvider.mockResolvedValue({ complete })

    const result = await proposeReportModification(baseReport(), 'make it warmer')

    expect('code' in result).toBe(false)
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
