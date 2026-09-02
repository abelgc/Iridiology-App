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

const mockReport: ReportContent = {
  section_1_general_terrain: 'General constitution notes.',
  section_2_emotional_field: 'Autonomic tone is elevated.',
  section_3_cognitive_nervous: 'Nervous ring is compressed.',
  section_4_immune_lymphatic: 'Lymphatic flow is adequate.',
  section_5_endocrine_hormonal: 'Parathyroid zone shows sustained compression.',
  section_6_circulatory_cardiorespiratory: 'Respiratory zone shows an old, stable mark.',
  section_7_hepatic: 'Hepatic sector shows lacunar formations.',
  section_8_digestive_intestinal: 'Intestinal zone fibre density reduced.',
  section_9_renal_urinary: 'Renal zone is stable.',
  section_10_structural_integumentary: 'Structural fibres show long-standing load.',
  section_11_detected_axes: 'Axis: endocrine and structural system',
  section_12_conclusion: 'Overall the case centres on endocrine-skeletal load.',
  section_13_strengths_of_the_body: 'Cardiovascular reserve is adequate.',
  section_14_recommendations: '**Pituitary**\nVitamins: B Complex\nMinerals: Bromine\nHerbs: Mistletoe',
  section_15_iris_sign_patterns: '',
}

const systemVerdicts = Object.fromEntries(
  [
    'section_2_emotional_field',
    'section_3_cognitive_nervous',
    'section_4_immune_lymphatic',
    'section_5_endocrine_hormonal',
    'section_6_circulatory_cardiorespiratory',
    'section_7_hepatic',
    'section_8_digestive_intestinal',
    'section_9_renal_urinary',
    'section_10_structural_integumentary',
  ].map((k) => [k, { verdict: 'needs-action', clue: 'placeholder' }]),
)

function plannerFixtureWith(knownDiagnoses: Array<Record<string, unknown>>) {
  return {
    dominantPattern: 'endocrine and skeletal load',
    mainDriver: 'parathyroid compression',
    symptomFindingMap: ['bone pain -> skeletal strain'],
    systemVerdicts,
    crossSystemLinks: [],
    knownDiagnoses,
    safety: { flags: [], constraint: null },
  }
}

function writerFixture(keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, `Placeholder prose for ${k}.`]))
}

function implWith(knownDiagnoses: Array<Record<string, unknown>>) {
  return (params: any) => {
    const system: string = params.system
    if (system.includes('You are the Planner')) {
      return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(plannerFixtureWith(knownDiagnoses)) }] })
    }
    if (system.includes('You are Writer A')) {
      return Promise.resolve({
        content: [{
          type: 'text',
          text: JSON.stringify(writerFixture([
            'section_1_general_terrain', 'section_2_emotional_field', 'section_3_cognitive_nervous',
            'section_4_immune_lymphatic', 'section_5_endocrine_hormonal',
          ])),
        }],
      })
    }
    if (system.includes('You are Writer B')) {
      return Promise.resolve({
        content: [{
          type: 'text',
          text: JSON.stringify(writerFixture([
            'section_6_circulatory_cardiorespiratory', 'section_7_hepatic', 'section_8_digestive_intestinal',
            'section_9_renal_urinary', 'section_10_structural_integumentary',
          ])),
        }],
      })
    }
    if (system.includes('You are Writer C')) {
      return Promise.resolve({
        content: [{
          type: 'text',
          text: JSON.stringify(writerFixture(['section_11_detected_axes', 'section_12_conclusion', 'section_13_strengths_of_the_body'])),
        }],
      })
    }
    return Promise.resolve({ content: [{ type: 'text', text: '{}' }] })
  }
}

beforeEach(() => {
  mockGetAnthropicApiKey.mockReset().mockResolvedValue('test-anthropic-api-key')
  createMock.mockReset()
})

describe('known-diagnosis severity (soft weakness vs hard diagnosis)', () => {
  it('every Writer system prompt contains the soft/hard branching instructions', async () => {
    createMock.mockImplementation(implWith([]))
    await rewriteReportForClient(mockReport, 'en', 'Jane')

    const writerA = createMock.mock.calls.find(([p]: any) => p.system.includes('You are Writer A'))!
    expect(writerA[0].system).toContain('If severity is "soft"')
    expect(writerA[0].system).toContain('never redirect to a doctor for a soft entry')
    expect(writerA[0].system).toContain('If severity is "hard"')
    expect(writerA[0].system).toContain('doctor-coordination line')
  })

  it('the Planner system prompt asks for a severity classification with hard/soft examples', async () => {
    createMock.mockImplementation(implWith([]))
    await rewriteReportForClient(mockReport, 'en', 'Jane')

    const planner = createMock.mock.calls.find(([p]: any) => p.system.includes('You are the Planner'))!
    expect(planner[0].system).toContain('severity: "soft" | "hard"')
    expect(planner[0].system).toContain('hyperparathyroidism')
  })

  it('passes a soft severity through to the owning Writer group unchanged', async () => {
    createMock.mockImplementation(implWith([
      { condition: 'possible childhood asthma, unclear if still active', assignedSection: 'section_6_circulatory_cardiorespiratory', severity: 'soft' },
    ]))
    await rewriteReportForClient(mockReport, 'en', 'Jane')

    const writerB = createMock.mock.calls.find(([p]: any) => p.system.includes('You are Writer B'))!
    const sentContent = writerB[0].messages[0].content
    expect(sentContent).toContain('possible childhood asthma')
    expect(sentContent).toContain('"severity":"soft"')
  })

  it('passes a hard severity through to the owning Writer group unchanged', async () => {
    createMock.mockImplementation(implWith([
      { condition: 'hyperparathyroidism / raised PTH', assignedSection: 'section_5_endocrine_hormonal', severity: 'hard' },
    ]))
    await rewriteReportForClient(mockReport, 'en', 'Jane')

    const writerA = createMock.mock.calls.find(([p]: any) => p.system.includes('You are Writer A'))!
    const sentContent = writerA[0].messages[0].content
    expect(sentContent).toContain('hyperparathyroidism')
    expect(sentContent).toContain('"severity":"hard"')
  })

  it('defaults a missing/malformed severity to "hard" — the cautious fallback', async () => {
    createMock.mockImplementation(implWith([
      { condition: 'sciatica', assignedSection: 'section_10_structural_integumentary' }, // no severity field at all
    ]))
    await rewriteReportForClient(mockReport, 'en', 'Jane')

    const writerB = createMock.mock.calls.find(([p]: any) => p.system.includes('You are Writer B'))!
    const sentContent = writerB[0].messages[0].content
    expect(sentContent).toContain('"severity":"hard"')
  })
})
