import { describe, it, expect, vi } from 'vitest'
import { analyzeIrisDual } from '../analyze-dual'
import type { AIProvider, CompletionResponse } from '@/lib/ai/types'
import type { AnalysisRequest } from '@/types/claude'
import type { ReportContent } from '@/types/report'

// Regression test for P1 ("fixation on one finding") end to end: given a raw model response
// where "hepatic" is named as the causal connector in more sections than the SYSTEM
// CONNECTIONS cap allows, analyzeIrisDual() — the real function both /practitioner and
// /client call — must come back with the excess sections corrected by the fixation guard.
// Only the AI provider (external/slow) is mocked; buildUserPrompt, the synthesis assembly,
// parseReportResponse, detectDominantSystemFixation, and guardAgainstSystemFixation all run
// for real.

function biasedReport(): ReportContent {
  return {
    section_1_general_terrain: 'Constitution shows a hepatobiliary lean.',
    section_2_emotional_field: 'Autonomic tone is elevated, unrelated to the liver.',
    section_3_cognitive_nervous: 'This compounds demand on the liver filtration capacity.',
    section_4_immune_lymphatic: 'Lymphatic flow is adequate.',
    section_5_endocrine_hormonal: 'Thyroid conversion, which occurs in the liver, is affected.',
    section_6_circulatory_cardiorespiratory: 'Cardiac zone density is stable.',
    section_7_hepatic: 'Hepatic sector shows lacunar formations consistent with congestion.',
    section_8_digestive_intestinal: 'Intestinal zone fibre density is reduced.',
    section_9_renal_urinary: 'Renal load is compounded by ongoing hepatic congestion.',
    section_10_structural_integumentary: 'Structural fibres are intact.',
    section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
    section_12_conclusion: 'The case centres on hepatic burden as the dominant pattern.',
    section_13_strengths_of_the_body: 'Cardiovascular reserve appears adequate.',
    section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
  }
}

function makeRequest(): AnalysisRequest {
  return {
    sessionId: '',
    patientId: '', // empty — buildPatientContext short-circuits, no Supabase call needed
    rightIrisBase64: 'right-eye-data',
    leftIrisBase64: 'left-eye-data',
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

function fakeProvider(responsesBySystemMarker: Array<[string, CompletionResponse]>): AIProvider {
  return {
    complete: vi.fn(async (request) => {
      for (const [marker, response] of responsesBySystemMarker) {
        if (request.systemPrompt.includes(marker)) return response
      }
      throw new Error(`No mock response configured for system prompt starting: ${request.systemPrompt.slice(0, 60)}`)
    }),
  }
}

describe('analyzeIrisDual — P1 fixation guard end to end', () => {
  it('corrects the excess sections when the model over-uses one hub system as the connector', async () => {
    const biased = biasedReport()

    const correctedSection9 = 'Renal function shows adequate elimination capacity independent of other systems.'

    const anthropic = fakeProvider([
      // Leg 1: Claude's own analysis (STANDARD_ANALYSIS system prompt)
      ['You are a clinical iridology report writer', { text: JSON.stringify(biased), stopReason: 'end_turn' }],
      // Synthesis call
      ['You are a senior clinical iridologist producing a definitive iris analysis report', { text: JSON.stringify(biased), stopReason: 'end_turn' }],
      // Fixation-guard targeted rewrite call
      [
        'fixing a specific problem in a report you already wrote',
        { text: JSON.stringify({ section_9_renal_urinary: correctedSection9 }), stopReason: 'end_turn' },
      ],
    ])
    const openai = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(biased), stopReason: 'end_turn' }],
    ])

    const result = await analyzeIrisDual(makeRequest(), 'en', { providers: { anthropic: anthropic as any, openai: openai as any } })

    if ('code' in result) throw new Error(`Expected a report, got error: ${result.message}`)

    // The 3rd section flagged for the hepatic hub (section_3, section_5, section_9, in body-
    // section order) is the one beyond the cap of 2 — it must come back rewritten.
    expect(result.section_9_renal_urinary).toBe(correctedSection9)

    // The first 2 flagged sections are within the cap — left as the model wrote them.
    expect(result.section_3_cognitive_nervous).toBe(biased.section_3_cognitive_nervous)
    expect(result.section_5_endocrine_hormonal).toBe(biased.section_5_endocrine_hormonal)

    // Untouched sections are untouched.
    expect(result.section_7_hepatic).toBe(biased.section_7_hepatic)
  })

  it('REGRESSION (Bhargavi Dasi over-anchoring case, 2026-08-24): corrects the excess sections when the model over-uses a reported condition — not an organ — as its explanation', async () => {
    // The organ-hub guard alone cannot see this: no organ name repeats, only an explicit
    // callback to what the patient reported (hyperparathyroidism/PTH here, but the guard
    // never names it — that's the point of the structural detector).
    const anchored: ReportContent = {
      section_1_general_terrain: 'The overall picture centres on how calcium is being managed.',
      section_2_emotional_field: 'Emotional field carries strain around self-worth.',
      section_3_cognitive_nervous: 'Nervous system runs with too much drive and not enough recovery.',
      section_4_immune_lymphatic: 'Immune and lymphatic system is holding steady.',
      section_5_endocrine_hormonal: 'Since you\'ve mentioned diagnosed hyperparathyroidism and raised PTH, this is the engine behind your symptoms.',
      section_6_circulatory_cardiorespiratory: 'The palpitations you feel fit with the calcium disturbance already flagged elsewhere in this report.',
      section_7_hepatic: 'Liver is running slow and bile flow is sluggish.',
      section_8_digestive_intestinal: 'This fits well with the bloating and low appetite you have described.',
      section_9_renal_urinary: 'Kidneys and adrenals are holding steady.',
      section_10_structural_integumentary: 'This matches decades of back pain, and since you\'ve mentioned osteoporosis already, keep it in view with your doctor.',
      section_11_detected_axes: 'Axis: endocrine and structural system',
      section_12_conclusion: 'The calcium disturbance you\'ve mentioned is the main driver.',
      section_13_strengths_of_the_body: 'Immune and kidney reserve appear adequate.',
      section_14_recommendations: '**Pituitary**\nVitamins: B Complex\nMinerals: Bromine\nHerbs: Mistletoe',
    }

    const correctedSection8 = 'Gastric tone and colon motility both show independent reduction.'
    const correctedSection10 = 'Structural fibres show a long-standing mechanical load pattern independent of other findings.'

    const anthropic = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(anchored), stopReason: 'end_turn' }],
      ['You are a senior clinical iridologist producing a definitive iris analysis report', { text: JSON.stringify(anchored), stopReason: 'end_turn' }],
      // The organ-hub guard finds nothing (no organ repeats) and makes no call; only the
      // history-callback guard's targeted rewrite call fires, for both excess sections
      // (section_8 and section_10 — the 3rd and 4th of the 4 flagged, beyond the cap of 2).
      [
        'revising a report you already wrote because it leans too often on',
        {
          text: JSON.stringify({
            section_8_digestive_intestinal: correctedSection8,
            section_10_structural_integumentary: correctedSection10,
          }),
          stopReason: 'end_turn',
        },
      ],
    ])
    const openai = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(anchored), stopReason: 'end_turn' }],
    ])

    const result = await analyzeIrisDual(makeRequest(), 'en', { providers: { anthropic: anthropic as any, openai: openai as any } })

    if ('code' in result) throw new Error(`Expected a report, got error: ${result.message}`)

    // section_5, section_6, section_8, section_10 all call back to patient history — the
    // 3rd and 4th (section_8, section_10) are beyond the cap of 2 and must come back rewritten.
    expect(result.section_8_digestive_intestinal).toBe(correctedSection8)
    expect(result.section_10_structural_integumentary).toBe(correctedSection10)

    // The first 2 flagged sections are within the cap — left as the model wrote them.
    expect(result.section_5_endocrine_hormonal).toBe(anchored.section_5_endocrine_hormonal)
    expect(result.section_6_circulatory_cardiorespiratory).toBe(anchored.section_6_circulatory_cardiorespiratory)
  })

  it('leaves the report untouched when no hub system exceeds the cap', async () => {
    const clean: ReportContent = {
      ...biasedReport(),
      section_3_cognitive_nervous: 'Nervous ring shows mild compression, independent finding.',
      section_5_endocrine_hormonal: 'Thyroid zone shows isolated pigmentation.',
      section_9_renal_urinary: 'Renal zone is stable, no notable burden.',
    }

    const anthropic = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(clean), stopReason: 'end_turn' }],
      ['You are a senior clinical iridologist producing a definitive iris analysis report', { text: JSON.stringify(clean), stopReason: 'end_turn' }],
    ])
    const openai = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(clean), stopReason: 'end_turn' }],
    ])

    const result = await analyzeIrisDual(makeRequest(), 'en', { providers: { anthropic: anthropic as any, openai: openai as any } })

    if ('code' in result) throw new Error(`Expected a report, got error: ${result.message}`)
    expect(result).toEqual(clean)
    // No third "fixing a specific problem" call should have been made.
    expect((anthropic.complete as any).mock.calls).toHaveLength(2)
  })
})
