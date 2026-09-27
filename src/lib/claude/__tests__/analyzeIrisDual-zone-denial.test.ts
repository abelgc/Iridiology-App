import { describe, it, expect, vi } from 'vitest'
import { analyzeIrisDual } from '../analyze-dual'
import type { AIProvider, CompletionResponse } from '@/lib/ai/types'
import type { AnalysisRequest } from '@/types/claude'
import type { ReportContent } from '@/types/report'

// Real path both /practitioner and /client use. Only the model is mocked.
// Terrain already named furrows in the lower quadrants; renal and strengths then
// say the kidney zone has no lacunae. The report that leaves this function must
// not keep that denial.

function vidyaLike(): ReportContent {
  return {
    section_1_general_terrain:
      'Fibre density is closer to Seda-lino, with small waves and mild lacunar openings rather than dense compaction. The right iris shows a radial furrow network through the lower quadrants.',
    section_2_emotional_field: 'Autonomic tone is mildly irregular through the lower arc.',
    section_3_cognitive_nervous: 'Cranial zone fibre remains compact.',
    section_4_immune_lymphatic: 'Lymphatic edge is mildly diffuse.',
    section_5_endocrine_hormonal: "No dense, sharply bordered open lacunae are visible in the thyroid territory at 2 o'clock.",
    section_6_circulatory_cardiorespiratory: 'Vascular tone is even.',
    section_7_hepatic: 'Golden pigment sits near the pupillary border. Fibre in this zone stays compact rather than frayed into open lacunae.',
    section_8_digestive_intestinal: 'Radial furrows crossing the lower quadrants support sluggish transit.',
    section_9_renal_urinary: "The kidney territory at 9 o'clock shows preserved fibre density without open lacunae.",
    section_10_structural_integumentary: 'No scurf rim of significant density is clearly demarcated.',
    section_11_detected_axes: 'Axis: liver and lymphatic drainage and skin elimination',
    section_12_conclusion: 'Filtering load is the dominant functional burden.',
    section_13_strengths_of_the_body: 'The kidney territories show clean fibre structure without lacunae.',
    section_14_recommendations: '**Liver**\nVitamins: A\nMinerals: Iron\nHerbs: Dandelion root',
  }
}

function makeRequest(): AnalysisRequest {
  return {
    sessionId: '',
    patientId: '',
    rightIrisBase64: 'right-eye-data',
    leftIrisBase64: 'left-eye-data',
    patientData: {
      full_name: 'Vidya Dasi Poland',
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
      throw new Error(`No mock response configured for system prompt starting: ${request.systemPrompt.slice(0, 80)}`)
    }),
  }
}

describe('analyzeIrisDual — zone denial guard', () => {
  it('REGRESSION (Vidya Dasi Poland, 2026-09-27): replaces a kidney denial when terrain already placed markings in that quadrant', async () => {
    const original = vidyaLike()
    const correctedSection9 = 'Radial furrows through the lower quadrants reach the kidney territory and mark reduced fibre integrity there.'
    const correctedSection13 = 'Adaptive reserve remains, and the lower-quadrant furrows still mark the kidney zone rather than a clean field.'

    const anthropic = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(original), stopReason: 'end_turn' }],
      ['You are a senior clinical iridologist producing a definitive iris analysis report', { text: JSON.stringify(original), stopReason: 'end_turn' }],
      ['contradicts a marking already written in general terrain', {
        text: JSON.stringify({
          section_7_hepatic: 'Golden pigment sits near the pupillary border. Lower-quadrant furrows also cross this sector.',
          section_9_renal_urinary: correctedSection9,
          section_13_strengths_of_the_body: correctedSection13,
        }),
        stopReason: 'end_turn',
      }],
    ])
    const openai = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(original), stopReason: 'end_turn' }],
    ])

    const result = await analyzeIrisDual(makeRequest(), 'en', { providers: { anthropic: anthropic as never, openai: openai as never } })
    if ('code' in result) throw new Error(`Expected a report, got error: ${result.message}`)

    expect(result.section_9_renal_urinary).toBe(correctedSection9)
    expect(result.section_13_strengths_of_the_body).toBe(correctedSection13)
    expect(result.section_8_digestive_intestinal).toBe(original.section_8_digestive_intestinal)
    expect(result.section_5_endocrine_hormonal).toBe(original.section_5_endocrine_hormonal)
    expect(result.section_9_renal_urinary).not.toMatch(/without open lacunae/i)
  })
})
