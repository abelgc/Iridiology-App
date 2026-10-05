import { describe, it, expect } from 'vitest'
import { detectDominantSystemFixation, detectHistoryCallbackOveruse } from '../detect-fixation'
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

describe('detectHistoryCallbackOveruse (REGRESSION: Bhargavi Dasi over-anchoring case, 2026-08-24)', () => {
  it('returns null when no section leans on patient history as its explanation', () => {
    const report = baseReport()
    expect(detectHistoryCallbackOveruse(report)).toBeNull()
  })

  it('flags a reported condition reused as the explanation in more than the cap of sections, regardless of which condition it is', () => {
    // Same shape as the real production report: "hyperparathyroidism" here, but the
    // detector never names it — this is the whole point of the structural approach.
    const report = baseReport({
      section_5_endocrine_hormonal:
        'Since you\'ve mentioned diagnosed hyperparathyroidism and raised PTH, this is the engine behind your bone pain.',
      section_6_circulatory_cardiorespiratory:
        'The palpitations you feel fit with the calcium disturbance already flagged elsewhere in this report.',
      section_8_digestive_intestinal:
        'This fits well with the bloating and low appetite you have described.',
      section_10_structural_integumentary:
        'This matches decades of back pain, and since you\'ve mentioned osteoporosis already, keep it in view with your doctor.',
    })

    const flag = detectHistoryCallbackOveruse(report)
    expect(flag).not.toBeNull()
    expect(flag?.count).toBe(4)
    expect(flag?.sections).toEqual([
      'section_5_endocrine_hormonal',
      'section_6_circulatory_cardiorespiratory',
      'section_8_digestive_intestinal',
      'section_10_structural_integumentary',
    ])
  })

  it('generalises to a condition never seen in any real case so far — a thyroid history, not hyperparathyroidism', () => {
    // The detector must never need updating for what a future patient happens to report.
    const report = baseReport({
      section_3_cognitive_nervous: 'Since you\'ve mentioned a thyroid history, this fits with your fatigue.',
      section_5_endocrine_hormonal: 'This lines up with what you have described about your thyroid.',
      section_7_hepatic: 'You\'ve mentioned your thyroid condition, and that lines up with what shows here.',
    })

    const flag = detectHistoryCallbackOveruse(report)
    expect(flag).not.toBeNull()
    expect(flag?.count).toBe(3)
  })

  it('does not flag a section that states a finding without calling back to patient history', () => {
    const report = baseReport({
      section_5_endocrine_hormonal: 'Sustained compression is visible around the pituitary and thyroid territory.',
      section_6_circulatory_cardiorespiratory: 'Cardiac rhythm is steady and regular.',
      section_8_digestive_intestinal: 'Gastric tone and colon motility are both reduced.',
    })
    expect(detectHistoryCallbackOveruse(report)).toBeNull()
  })

  it('ignores general_terrain, axes, conclusion, strengths, and recommendations, matching the organ guard\'s scope', () => {
    const report = baseReport({
      section_1_general_terrain: 'Since you\'ve mentioned this history, the overall picture centres on it.',
      section_11_detected_axes: 'The calcium disturbance you\'ve mentioned is quietly working against your appetite.',
      section_12_conclusion: 'The calcium disturbance you\'ve mentioned, which lines up with what shows here, is the main driver.',
      section_13_strengths_of_the_body: 'Despite what you\'ve mentioned, your immune system holds steady.',
    })
    expect(detectHistoryCallbackOveruse(report)).toBeNull()
  })

  it('REGRESSION (register gap, 2026-08-26): catches Stage 1\'s real third-person phrasing, not just Stage 2\'s rewritten "you\'ve mentioned"', () => {
    // Sourced verbatim-in-style from a real live Stage 1 output — Stage 1 never writes
    // "you've mentioned", it writes "consistent with her reported X". This detector runs
    // directly on Stage 1 output (the only guard /practitioner has, with no Stage 2 filter),
    // so it must catch Stage 1's own voice, not just Stage 2's client-facing rewrite.
    const report = baseReport({
      section_5_endocrine_hormonal:
        'Sustained pressure here is consistent with her reported hyperparathyroidism and elevated PTH.',
      section_6_circulatory_cardiorespiratory:
        'The palpitations noted are consistent with her reported hyperparathyroid state rather than a primary cardiac finding.',
      section_8_digestive_intestinal:
        'Reduced appetite here correlates with the patient\'s reported hyperparathyroidism and its systemic load.',
      section_10_structural_integumentary:
        'This pattern is consistent with her reported hyperparathyroidism placing additional calcium demand on the skeletal frame.',
    })

    const flag = detectHistoryCallbackOveruse(report)
    expect(flag).not.toBeNull()
    expect(flag?.count).toBe(4)
  })

  it('REGRESSION (Heidrun Schwarzenberger report, 2026-10-05): catches Stage 1 narrating general history as monitoring advice, referral, or absence of corroboration', () => {
    // Five sentences quoted from the real report (reports.id 6f84ed2b-5aea-4379-8c29-a5f4360f14d0).
    // The guard returned 0 hits on all five when run against the live patterns on 2026-10-05.
    const report = baseReport({
      section_2_emotional_field:
        'The reported early loss of her father at age 14 is a formative period for autonomic patterning, and present physiological carryover is corroborated here by the collarette tone itself rather than by history alone.',
      section_4_immune_lymphatic:
        'Reported antibiotic use and prior COVID infection history should be factored into mucosal and immune-reserve monitoring going forward, since repeated immune challenge compounds a constitutionally reduced elimination throughput even without a corresponding iris marker. The sinus surgery history in 2003 and 2004 is noted, and the upper cranial arc shows no clear residual marking; this is stated as an absence of corroborating iris evidence rather than a denial of the surgical history itself.',
      section_5_endocrine_hormonal:
        'What is visible does not show an open lacuna distinct enough to add new iris-based information beyond the surgical history of thyroid removal in 2017, which is already known. Thyroid hormone replacement adequacy following thyroidectomy should be confirmed through clinician-directed thyroid panel testing rather than iris inspection.',
      section_6_circulatory_cardiorespiratory:
        'Given the reported paternal family history of heart attack and heart surgery, this finding in the adjacent territory warrants attention as a zone to monitor over time and supports formal cardiovascular risk assessment including blood pressure and lipid profile.',
      section_9_renal_urinary:
        'The history of ovarian or cyst removal in 2021 is not independently corroborated by a residual iris marker in this territory; it is therefore not carried forward as an active iris finding.',
    })

    const flag = detectHistoryCallbackOveruse(report)
    expect(flag).not.toBeNull()
    expect(flag?.count).toBe(5)
    expect(flag?.sections).toEqual([
      'section_2_emotional_field',
      'section_4_immune_lymphatic',
      'section_5_endocrine_hormonal',
      'section_6_circulatory_cardiorespiratory',
      'section_9_renal_urinary',
    ])
  })

  it('REGRESSION (register gap, 2026-08-26): does not flag a contradiction or negation as a history callback', () => {
    // Real Stage 1 phrasing that mentions patient history but does NOT use it as the
    // section's explanation — these must stay unflagged, or the guard becomes noise.
    const report = baseReport({
      section_6_circulatory_cardiorespiratory:
        'This does not support a structural cardiac finding despite her reported palpitations.',
      section_9_renal_urinary:
        'Nothing here supports a current urinary symptom, and the patient has not reported one.',
    })
    expect(detectHistoryCallbackOveruse(report)).toBeNull()
  })
})
