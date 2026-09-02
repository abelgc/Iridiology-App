import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: createMock } }
  }),
}))
const mockGetAnthropicApiKey = vi.fn().mockResolvedValue('test-anthropic-api-key')
vi.mock('@/lib/ai/get-provider', () => ({
  getAnthropicApiKey: () => mockGetAnthropicApiKey(),
}))

import { rewriteReportForClient } from '../writing-pipeline'
import type { ReportContent } from '@/types/report'

// REGRESSION (2026-09-02): real evidence in errors/rocío-soledad-giordano-client-report-es.md
// — "esto fits with la inflamación..." leaked the literal English connector phrase
// "fits with" into a Spanish report, inconsistent with the same document's correct
// "esto encaja con" elsewhere. SHARED_WRITER_RULES gave "fits with" as a bare English
// example three times (ASSERT VS REDIRECT, KNOWN DIAGNOSES, SELF-CHECK item 4) with no
// instruction to translate it when writing in another language.

const mockReport: ReportContent = {
  section_1_general_terrain: 'General constitution notes.',
  section_2_emotional_field: 'Autonomic tone is elevated.',
  section_3_cognitive_nervous: 'Nervous ring is compressed.',
  section_4_immune_lymphatic: 'Lymphatic flow is adequate.',
  section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
  section_6_circulatory_cardiorespiratory: 'Cardiac zone fibre density elevated.',
  section_7_hepatic: 'Hepatic sector shows lacunar formations.',
  section_8_digestive_intestinal: 'Intestinal zone fibre density reduced.',
  section_9_renal_urinary: 'Renal zone pigmentation noted.',
  section_10_structural_integumentary: 'Structural zone fibres intact.',
  section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
  section_12_conclusion: 'Overall constitutional weakness with hepatic burden.',
  section_13_strengths_of_the_body: 'Cardiovascular reserve appears adequate.',
  section_14_recommendations: '**Liver**\nVitamins: A, B12, C, E, Niacin\nMinerals: Iron, Potassium\nHerbs: Dandelion root',
  section_15_iris_sign_patterns: '',
}

function implWith(text: string) {
  return () => Promise.resolve({ content: [{ type: 'text', text }] })
}

beforeEach(() => {
  mockGetAnthropicApiKey.mockReset().mockResolvedValue('test-anthropic-api-key')
  createMock.mockReset()
})

describe('SHARED_WRITER_RULES — translate English examples into the target language', () => {
  it('every Writer system prompt instructs translating English example phrases (e.g. "fits with") when writing in another language', async () => {
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return implWith(
          JSON.stringify({
            dominantPattern: 'x', mainDriver: 'x', symptomFindingMap: [],
            systemVerdicts: {}, crossSystemLinks: [], knownDiagnoses: [],
            safety: { flags: [], constraint: null },
          }),
        )()
      }
      return implWith(JSON.stringify({})).call(null)
    })

    await rewriteReportForClient(mockReport, 'es', 'Rocío').catch(() => {})

    const writerCall = createMock.mock.calls.find(
      ([p]: any) => p.system.includes('You are Writer A'),
    )
    expect(writerCall).toBeTruthy()
    const prompt: string = writerCall![0].system
    expect(prompt).toContain('translate every one of them')
    expect(prompt).toContain('never copy an English word or phrase')
    expect(prompt).toContain('such as "fits with"')
  })

  it('does not repeat the literal English connector phrase "fits with" as a copyable anchor', async () => {
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return implWith(
          JSON.stringify({
            dominantPattern: 'x', mainDriver: 'x', symptomFindingMap: [],
            systemVerdicts: {}, crossSystemLinks: [], knownDiagnoses: [],
            safety: { flags: [], constraint: null },
          }),
        )()
      }
      return implWith(JSON.stringify({})).call(null)
    })

    await rewriteReportForClient(mockReport, 'es', 'Rocío').catch(() => {})

    const writerCall = createMock.mock.calls.find(
      ([p]: any) => p.system.includes('You are Writer A'),
    )
    const prompt: string = writerCall![0].system
    // The one mention inside "such as \"fits with\"" (the meta-instruction itself) is
    // fine — what must be gone is every OTHER bare repetition that made it a copyable
    // anchor (the ASSERT VS REDIRECT rule, the KNOWN DIAGNOSES soft example, and the
    // SELF-CHECK item all used to quote it as a literal suggested phrase).
    const occurrences = prompt.split('fits with').length - 1
    expect(occurrences).toBe(1)
  })
})
