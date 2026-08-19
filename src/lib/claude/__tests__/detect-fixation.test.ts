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
  it('returns null when no organ is over-represented', () => {
    const report = baseReport()
    expect(detectDominantSystemFixation(report)).toBeNull()
  })

  it('flags hepatic when it dominates more than the cap of body-system sections', () => {
    const report = baseReport({
      section_2_emotional_field: 'Autonomic tone places secondary pressure on hepatic output.',
      section_3_cognitive_nervous: 'This compounds demand on the liver filtration capacity.',
      section_5_endocrine_hormonal: 'Thyroid conversion, which occurs in the liver, is affected.',
    })

    const flag = detectDominantSystemFixation(report)
    expect(flag).not.toBeNull()
    expect(flag?.hub).toBe('hepatic')
    expect(flag?.count).toBeGreaterThan(2)
  })

  it('generalises to an organ outside the original hand-picked set — pancreas, not previously tracked', () => {
    // This is the whole point of the redesign: any organ in the same catalogue the
    // generation prompt itself reasons from should be catchable, not just a fixed shortlist
    // discovered from one real case.
    const report = baseReport({
      section_5_endocrine_hormonal: 'Pancreatic regulatory strain is the clearer finding here.',
      section_7_hepatic: 'Hepatic sector shows lacunar formations, compounded by pancreatic load.',
      section_8_digestive_intestinal: 'Reduced enzymatic output, driven by pancreatic insufficiency.',
    })

    const flag = detectDominantSystemFixation(report)
    expect(flag).not.toBeNull()
    expect(flag?.hub).toBe('pancreas')
    expect(flag?.count).toBe(3)
  })

  it('also generalises to an organ never seen in any real case so far — spleen', () => {
    const report = baseReport({
      section_2_emotional_field: 'Splenic tension underlies this pattern.',
      section_4_immune_lymphatic: 'Spleen involvement is the clearest driver of reduced clearance.',
      section_6_circulatory_cardiorespiratory: 'Spleen-linked vascular load is notable here too.',
    })

    const flag = detectDominantSystemFixation(report)
    expect(flag).not.toBeNull()
    expect(flag?.hub).toBe('spleen')
    expect(flag?.count).toBe(3)
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

  it('picks the worst offender when multiple organs exceed the cap', () => {
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
