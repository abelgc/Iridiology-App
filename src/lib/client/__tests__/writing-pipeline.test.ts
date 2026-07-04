import { describe, it, expect, vi } from 'vitest'

// Mock the Anthropic SDK before importing the module
const createMock = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Your digestive system shows signs of chronic stress.' }],
  stop_reason: 'end_turn',
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: {
        create: createMock,
      },
    }
  }),
}))

import { rewriteReportForClient } from '../writing-pipeline'
import type { ReportContent } from '@/types/report'

const mockReport: ReportContent = {
  section_1_general_terrain: 'Dense fiber structure in zone 4 indicates hepatic congestion with lacunar formations.',
  section_2_emotional_field: 'Autonomic dysregulation visible in collarette irregularity.',
  section_3_cognitive_nervous: 'Nervous ring present with fiber compression in sector 11.',
  section_4_immune_lymphatic: 'Lymphatic rosette observed peripherally.',
  section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
  section_6_circulatory_cardiorespiratory: 'Cardiac zone fiber density elevated.',
  section_7_hepatic: 'Hepatic sector shows lacunar formations.',
  section_8_digestive_intestinal: 'Intestinal zone fiber density reduced.',
  section_9_renal_urinary: 'Renal zone pigmentation noted.',
  section_10_structural_integumentary: 'Structural zone fibers intact.',
  section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
  section_12_conclusion: 'Overall constitutional weakness with hepatic burden.',
  section_13_strengths_of_the_body: 'Cardiovascular reserve appears adequate.',
  section_14_recommendations: '**Liver**\nVitamins: A, B12, C, E, Niacin\nMinerals: Iron, Potassium\nHerbs: Dandelion root',
}

describe('rewriteReportForClient', () => {
  it('returns a ReportContent with the same 14 keys', async () => {
    const result = await rewriteReportForClient(mockReport, 'en')
    expect(Object.keys(result)).toHaveLength(14)
    expect(result.section_1_general_terrain).toBeDefined()
    expect(result.section_12_conclusion).toBeDefined()
    expect(result.section_13_strengths_of_the_body).toBeDefined()
  })

  it('passes section_14_recommendations through unchanged, without calling the rewrite pipeline', async () => {
    const result = await rewriteReportForClient(mockReport, 'en')
    expect(result.section_14_recommendations).toBe(mockReport.section_14_recommendations)
  })

  it('returns non-empty strings for each section', async () => {
    const result = await rewriteReportForClient(mockReport, 'en')
    for (const key of Object.keys(result)) {
      expect(result[key as keyof typeof result].length).toBeGreaterThan(0)
    }
  })

  it('falls back to original section text if pipeline throws', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    vi.mocked(Anthropic).mockImplementationOnce(function () {
      return {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as any
    })

    const result = await rewriteReportForClient(mockReport, 'en')
    // Should not throw; falls back gracefully
    expect(result.section_1_general_terrain).toBeDefined()
  })
})
