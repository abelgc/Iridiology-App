import { describe, it, expect, vi } from 'vitest'
import { analyzeIrisDual } from '../analyze-dual'
import type { AIProvider, CompletionResponse } from '@/lib/ai/types'
import type { AnalysisRequest } from '@/types/claude'
import type { ReportContent } from '@/types/report'

// Regression test (Ana Iranzo investigation, 2026-09-14): a code-level trace found the
// synthesis step's rule #2 ("pure visual description = discard") requires Analysis B's
// statement to carry an explicit same-clause meaning tag or be discarded outright — a
// plausible mechanism for stripping descriptive richness (e.g. "hazel iris, moderate
// pigmentation") that a plain, unprompted model call preserved. This asserts the actual text
// sent to the synthesis call keeps concrete visual facts and puts the burden of supplying
// meaning on the synthesis writer, rather than discarding the fact for lacking an explicit tag.

function minimalReport(): ReportContent {
  const value = 'placeholder'
  return {
    section_1_general_terrain: value,
    section_2_emotional_field: value,
    section_3_cognitive_nervous: value,
    section_4_immune_lymphatic: value,
    section_5_endocrine_hormonal: value,
    section_6_circulatory_cardiorespiratory: value,
    section_7_hepatic: value,
    section_8_digestive_intestinal: value,
    section_9_renal_urinary: value,
    section_10_structural_integumentary: value,
    section_11_detected_axes: value,
    section_12_conclusion: value,
    section_13_strengths_of_the_body: value,
    section_14_recommendations: value,
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

describe('analyzeIrisDual — synthesis prompt content', () => {
  it('allows a concrete visual fact through without requiring an explicit same-clause meaning tag, putting the burden on the synthesis writer to supply meaning', async () => {
    const report = minimalReport()
    const response: CompletionResponse = { text: JSON.stringify(report), stopReason: 'end_turn' }

    const anthropicComplete = vi.fn(async () => response)
    const anthropic: AIProvider = { complete: anthropicComplete }
    const openai: AIProvider = { complete: vi.fn(async () => response) }

    await analyzeIrisDual(makeRequest(), 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    const synthesisCall = anthropicComplete.mock.calls.find(
      (call) => typeof call[0]?.userText === 'string' && call[0].userText.includes('SYNTHESIS INSTRUCTIONS'),
    )
    expect(synthesisCall).toBeDefined()
    const userText = synthesisCall![0].userText as string

    expect(userText).toContain('supply the functional meaning yourself')
    expect(userText).not.toContain('NOT a pure visual description')
  })
})
