import { describe, it, expect, vi } from 'vitest'
import { guardAgainstSystemFixation } from '../rewrite-fixation'
import type { AIProvider } from '@/lib/ai/types'
import type { ReportContent } from '@/types/report'

function makeReport(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    section_1_general_terrain: 'General constitution notes.',
    section_2_emotional_field: 'Adrenal strain compounds elsewhere.',
    section_3_cognitive_nervous: 'Liver burden compounds nervous load.',
    section_4_immune_lymphatic: 'Lymphatic flow is adequate.',
    section_5_endocrine_hormonal: 'Liver-driven thyroid conversion issue.',
    section_6_circulatory_cardiorespiratory: 'Cardiac zone density is stable.',
    section_7_hepatic: 'Hepatic sector shows lacunar formations.',
    section_8_digestive_intestinal: 'Intestinal zone fibre density reduced.',
    section_9_renal_urinary: 'Renal load compounded by hepatic congestion.',
    section_10_structural_integumentary: 'Structural fibres intact.',
    section_11_detected_axes: 'Axis: liver and digestive system',
    section_12_conclusion: 'Overall the case centres on hepatic burden.',
    section_13_strengths_of_the_body: 'Cardiovascular reserve is adequate.',
    section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
    ...overrides,
  }
}

describe('guardAgainstSystemFixation', () => {
  it('returns the report untouched when nothing is flagged', async () => {
    const complete = vi.fn()
    const provider: AIProvider = { complete }
    const report = makeReport({
      section_2_emotional_field: 'Autonomic tone is elevated.',
      section_3_cognitive_nervous: 'Nervous ring is compressed.',
      section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
      section_9_renal_urinary: 'Renal zone is stable.',
    })

    const result = await guardAgainstSystemFixation(provider, report)

    expect(result).toBe(report)
    expect(complete).not.toHaveBeenCalled()
  })

  it('rewrites only the sections beyond the first 2 flagged, on a real trigger', async () => {
    const complete = vi.fn().mockResolvedValue({
      stopReason: 'end_turn',
      text: JSON.stringify({
        section_9_renal_urinary: 'Renal function is holding steady on its own terms.',
      }),
    })
    const provider: AIProvider = { complete }

    // Hepatic hub hits section_3, section_5, section_9 (3 sections, over the cap of 2) —
    // sections_to_rewrite = flag.sections.slice(2) = the 3rd one only.
    const report = makeReport()

    const result = await guardAgainstSystemFixation(provider, report)

    expect(complete).toHaveBeenCalledTimes(1)
    expect(result.section_9_renal_urinary).toBe('Renal function is holding steady on its own terms.')
    // Untouched sections stay exactly as they were.
    expect(result.section_3_cognitive_nervous).toBe(report.section_3_cognitive_nervous)
    expect(result.section_5_endocrine_hormonal).toBe(report.section_5_endocrine_hormonal)
  })

  it('falls back to the original report if the rewrite call fails', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('network error'))
    const provider: AIProvider = { complete }
    const report = makeReport()

    const result = await guardAgainstSystemFixation(provider, report)

    expect(result).toEqual(report)
  })

  it('falls back to the original report if the rewrite response is not valid JSON', async () => {
    const complete = vi.fn().mockResolvedValue({ stopReason: 'end_turn', text: 'not json' })
    const provider: AIProvider = { complete }
    const report = makeReport()

    const result = await guardAgainstSystemFixation(provider, report)

    expect(result).toEqual(report)
  })
})
