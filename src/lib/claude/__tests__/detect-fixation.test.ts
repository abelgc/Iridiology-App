import { describe, it, expect } from 'vitest'
import { detectDominantSystemFixation } from '../detect-fixation'
import type { ReportContent } from '@/types/report'

function baseReport(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    section_1_general_terrain: 'General constitution notes.',
    section_2_emotional_field: 'Autonomic tone is elevated.',
    section_3_cognitive_nervous: 'Nervous ring is compressed.',
    section_4_immune_lymphatic: 'Lymphatic flow is adequate.',
    section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
    section_6_circulatory_cardiorespiratory: 'Cardiac zone density is stable.',
    section_7_hepatic: 'Hepatic sector shows lacunar formations.',
    section_8_digestive_intestinal: 'Intestinal zone fibre density reduced.',
    section_9_renal_urinary: 'Renal zone is stable.',
    section_10_structural_integumentary: 'Structural fibres intact.',
    section_11_detected_axes: 'Axis: liver and digestive system',
    section_12_conclusion: 'Overall the case centres on hepatic burden.',
    section_13_strengths_of_the_body: 'Cardiovascular reserve is adequate.',
    section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
    ...overrides,
  }
}

describe('detectDominantSystemFixation', () => {
  it('returns null when no hub system is over-represented', () => {
    const report = baseReport()
    expect(detectDominantSystemFixation(report)).toBeNull()
  })

  it('flags a hub mentioned as connector in more than 2 body-system sections', () => {
    const report = baseReport({
      section_2_emotional_field: 'Autonomic tone places secondary pressure on adrenal output.',
      section_3_cognitive_nervous: 'This compounds demand on the liver filtration capacity.',
      section_5_endocrine_hormonal: 'Thyroid conversion, which occurs in the liver, is affected.',
      section_9_renal_urinary: 'Renal load is compounded by ongoing hepatic congestion.',
    })

    const flag = detectDominantSystemFixation(report)
    expect(flag).not.toBeNull()
    expect(flag?.hub).toBe('hepatic')
    expect(flag?.count).toBe(3)
    expect(flag?.sections).not.toContain('section_7_hepatic')
  })

  it('does not count a hub within its own section', () => {
    // Only the hepatic section itself mentions liver — should not self-flag.
    const report = baseReport({
      section_7_hepatic: 'Liver filtration is reduced, with bile flow under pressure.',
    })
    expect(detectDominantSystemFixation(report)).toBeNull()
  })

  it('ignores general_terrain, axes, conclusion, strengths, and recommendations', () => {
    // These sections legitimately restate the dominant system — only the 9 body-system
    // sections should count toward the cap.
    const report = baseReport({
      section_1_general_terrain: 'Hepatobiliary dominant terrain, liver-led case.',
      section_11_detected_axes: 'Axis: liver and digestive system and adrenal',
      section_12_conclusion: 'Liver-focused recovery plan, hepatic priority.',
      section_13_strengths_of_the_body: 'Despite hepatic load, cardiovascular reserve holds.',
    })
    expect(detectDominantSystemFixation(report)).toBeNull()
  })

  it('picks the worst offender when multiple hubs exceed the cap', () => {
    const report = baseReport({
      section_2_emotional_field: 'Adrenal strain compounds the load elsewhere.',
      section_3_cognitive_nervous: 'Liver burden compounds nervous load; adrenal fatigue too.',
      section_5_endocrine_hormonal: 'Liver-driven thyroid conversion issue; adrenal involvement.',
      section_6_circulatory_cardiorespiratory: 'Adrenal-linked circulatory strain noted.',
      section_9_renal_urinary: 'Renal load compounded by hepatic congestion.',
    })
    const flag = detectDominantSystemFixation(report)
    expect(flag?.hub).toBe('adrenal')
    expect(flag?.count).toBe(4)
  })
})
