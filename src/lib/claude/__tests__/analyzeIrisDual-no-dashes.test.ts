import { describe, it, expect, vi } from 'vitest'
import { analyzeIrisDual } from '../analyze-dual'
import type { AIProvider, CompletionResponse } from '@/lib/ai/types'
import type { AnalysisRequest } from '@/types/claude'
import type { ReportContent } from '@/types/report'

// Real path both /practitioner and /client use. Only the model is mocked.
// The practitioner asked for no em-dashes in any report (2026-10-05): "queda super robot".
// The model is told not to write them, and this test pins the deterministic backstop that
// removes any it still writes before the report leaves analyzeIrisDual.

function dashedReport(): ReportContent {
  return {
    section_1_general_terrain: 'Fibre density is close to Lino — the stroma is tightly woven with few openings.',
    section_2_emotional_field: 'Autonomic tone is even through the upper arc.',
    section_3_cognitive_nervous: 'Cranial zone fibre remains compact.',
    section_4_immune_lymphatic: 'Lymphatic edge is mildly diffuse — no rosary is formed.',
    section_5_endocrine_hormonal: 'The thyroid territory shows a shallow lacuna.',
    section_6_circulatory_cardiorespiratory: 'Vascular tone is even.',
    section_7_hepatic: 'Golden pigment sits near the pupillary border — bile flow reads as sluggish.',
    section_8_digestive_intestinal: 'Transit reads as slow through the lower intestinal ring (hours 5–7).',
    section_9_renal_urinary: 'The renal territory keeps compact fibre.',
    section_10_structural_integumentary: 'No scurf rim of significant density is demarcated.',
    section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
    section_12_conclusion: 'Filtering load is the dominant functional burden – a functional picture, not a structural one.',
    section_13_strengths_of_the_body: 'Fibre density holds — recovery capacity is real.',
    section_14_recommendations: '**Liver**\nVitamins: A, C — as in the catalogue\nMinerals: Iron\nHerbs: Dandelion root',
  }
}

function makeRequest(): AnalysisRequest {
  return {
    sessionId: '',
    patientId: '',
    rightIrisBase64: 'right-eye-data',
    leftIrisBase64: 'left-eye-data',
    patientData: {
      full_name: 'Test Client',
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

describe('analyzeIrisDual — no em-dashes leave the pipeline', () => {
  it('REGRESSION (practitioner feedback, 2026-10-05): every section is free of em-dashes and en-dashes, numeric ranges become "to", and section 14 keeps its three prefixes', async () => {
    const original = dashedReport()
    const anthropic = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(original), stopReason: 'end_turn' }],
      ['You are a senior clinical iridologist producing a definitive iris analysis report', { text: JSON.stringify(original), stopReason: 'end_turn' }],
    ])
    const openai = fakeProvider([
      ['You are a clinical iridology report writer', { text: JSON.stringify(original), stopReason: 'end_turn' }],
    ])

    const result = await analyzeIrisDual(makeRequest(), 'en', { providers: { anthropic: anthropic as never, openai: openai as never } })
    if ('code' in result) throw new Error(`Expected a report, got error: ${result.message}`)

    for (const [key, value] of Object.entries(result)) {
      expect(value, `${key} still contains a dash`).not.toMatch(/[—–]/)
    }
    expect(result.section_1_general_terrain).toBe('Fibre density is close to Lino, the stroma is tightly woven with few openings.')
    expect(result.section_8_digestive_intestinal).toContain('hours 5 to 7')
    expect(result.section_14_recommendations).toMatch(/^\*\*Liver\*\*\nVitamins: A, C, as in the catalogue\nMinerals: Iron\nHerbs: Dandelion root$/)
  })
})
