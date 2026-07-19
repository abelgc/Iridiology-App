import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Anthropic SDK before importing the module
const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: {
        create: createMock,
      },
    }
  }),
}))

// Mock the shared API-key resolver (settings table -> env var) instead of stubbing
// process.env directly, so this test exercises the same lookup production code uses.
const mockGetAnthropicApiKey = vi.fn().mockResolvedValue('test-anthropic-api-key')
vi.mock('@/lib/ai/get-provider', () => ({
  getAnthropicApiKey: () => mockGetAnthropicApiKey(),
}))

import { rewriteReportForClient, firstNameFrom } from '../writing-pipeline'
import type { ReportContent } from '@/types/report'

const mockReport: ReportContent = {
  section_1_general_terrain: 'Dense fiber structure in zone 4 indicates hepatic congestion with lacunar formations.',
  section_2_emotional_field: 'Autonomic dysregulation visible in collarette irregularity.',
  section_3_cognitive_nervous: 'Nervous ring present with fiber compression in sector 11.',
  section_4_immune_lymphatic: 'Lymphatic rosette observed peripherally.',
  section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
  section_6_circulatory_cardiorespiratory: 'Cardiac zone fiber density elevated.',
  section_7_hepatic: 'Hepatic sector shows lacunar formations.',
  section_8_digestive_intestinal: 'Intestinal zone fiber density reduced.',
  section_9_renal_urinary: 'Renal zone pigmentation noted.',
  section_10_structural_integumentary: 'Structural zone fibers intact.',
  section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
  section_12_conclusion: 'Overall constitutional weakness with hepatic burden.',
  section_13_strengths_of_the_body: 'Cardiovascular reserve appears adequate.',
  section_14_recommendations: '**Liver**\nVitamins: A, B12, C, E, Niacin\nMinerals: Iron, Potassium\nHerbs: Dandelion root',
  section_15_iris_sign_patterns: '- **Radii Solaris** (right iris, 6 o\'clock, pancreatic territory): radial irritation pattern.',
}

const plannerFixture = {
  dominantPattern: 'hepatic and lymphatic overload',
  mainDriver: 'sluggish liver filtration',
  symptomFindingMap: ['fatigue -> adrenal strain'],
  systemVerdicts: {
    section_2_emotional_field: { verdict: 'needs-action', clue: 'autonomic tension' },
    section_3_cognitive_nervous: { verdict: 'needs-action', clue: 'fibre compression' },
    section_4_immune_lymphatic: { verdict: 'fine', clue: 'lymphatic flow adequate' },
    section_5_endocrine_hormonal: { verdict: 'needs-action', clue: 'thyroid pigmentation' },
    section_6_circulatory_cardiorespiratory: { verdict: 'needs-action', clue: 'cardiac zone density' },
    section_7_hepatic: { verdict: 'needs-action', clue: 'lacunar formations' },
    section_8_digestive_intestinal: { verdict: 'needs-action', clue: 'reduced fibre density' },
    section_9_renal_urinary: { verdict: 'fine', clue: 'renal zone stable' },
    section_10_structural_integumentary: { verdict: 'fine', clue: 'fibres intact' },
  },
  crossSystemLinks: ['liver strain compounds digestive load'],
  knownDiagnoses: [],
  safety: { flags: [], constraint: null },
}

const writerAFixture = {
  section_1_general_terrain: 'Jane, your body is carrying a hepatic and lymphatic load right now, and a sluggish liver is the main driver behind it.',
  section_2_emotional_field: 'Your nervous system is holding tension. That shows up as feeling wound up even at rest. Calming practice each day eases it.',
  section_3_cognitive_nervous: 'Your focus is under pressure right now. That is why concentrating feels harder than usual. Rest and steady sleep bring it back.',
  section_4_immune_lymphatic: 'Your lymphatic flow is holding up well.',
  section_5_endocrine_hormonal: 'Your thyroid is working harder than it should. That can leave you tired or cold. Gentle support helps it recover.',
}

const writerBFixture = {
  section_6_circulatory_cardiorespiratory: 'Your heart is working under extra strain. That can show up as tiring more easily. Light daily movement lightens the load.',
  section_7_hepatic: 'Your liver is filtering slower than it should. That is behind the fatigue and heavy feeling after meals. A gentle month of support gets it moving again.',
  section_8_digestive_intestinal: 'Your digestion is sluggish. That leaves you bloated after eating. More fibre and water ease it.',
  section_9_renal_urinary: 'Your kidneys are doing their job well.',
  section_10_structural_integumentary: 'Your structural system is holding steady.',
}

const writerCFixture = {
  section_11_detected_axes: 'Your liver strain is compounding the load on your digestion.',
  section_12_conclusion: 'Your liver is the priority. Support it first and your energy and digestion follow.',
  section_13_strengths_of_the_body: 'Your lymphatic flow, kidneys, and structural system are all holding up well.',
}

function defaultCreateImpl(params: any) {
  const system: string = params.system
  if (system.includes('You are the Planner')) {
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(plannerFixture) }] })
  }
  if (system.includes('You are Writer A')) {
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerAFixture) }] })
  }
  if (system.includes('You are Writer B')) {
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerBFixture) }] })
  }
  if (system.includes('You are Writer C')) {
    return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerCFixture) }] })
  }
  return Promise.resolve({ content: [{ type: 'text', text: '{}' }] })
}

beforeEach(() => {
  mockGetAnthropicApiKey.mockReset().mockResolvedValue('test-anthropic-api-key')
  createMock.mockReset()
  createMock.mockImplementation(defaultCreateImpl)
})

describe('firstNameFrom', () => {
  it('returns the first token of a full name', () => {
    expect(firstNameFrom('Maria Lopez')).toBe('Maria')
  })

  it('returns an empty string for null or blank input', () => {
    expect(firstNameFrom(null)).toBe('')
    expect(firstNameFrom('   ')).toBe('')
  })
})

describe('rewriteReportForClient', () => {
  it('makes exactly 4 model calls total: one planner and three parallel writers', async () => {
    await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(createMock).toHaveBeenCalledTimes(4)
  })

  it('returns a ReportContent with the same 14 keys', async () => {
    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(Object.keys(result)).toHaveLength(14)
    expect(result.section_1_general_terrain).toBeDefined()
    expect(result.section_12_conclusion).toBeDefined()
    expect(result.section_13_strengths_of_the_body).toBeDefined()
  })

  it('passes section_14_recommendations through unchanged, without calling the rewrite pipeline', async () => {
    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(result.section_14_recommendations).toBe(mockReport.section_14_recommendations)
  })

  it('excludes section_15_iris_sign_patterns entirely (practitioner-only, never sent to clients)', async () => {
    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(Object.keys(result)).not.toContain('section_15_iris_sign_patterns')
  })

  it('returns non-empty strings for each section', async () => {
    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    for (const key of Object.keys(result)) {
      expect(result[key as keyof typeof result].length).toBeGreaterThan(0)
    }
  })

  it("uses each writer's own text for its assigned sections", async () => {
    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(result.section_2_emotional_field).toBe(writerAFixture.section_2_emotional_field)
    expect(result.section_7_hepatic).toBe(writerBFixture.section_7_hepatic)
    expect(result.section_12_conclusion).toBe(writerCFixture.section_12_conclusion)
  })

  it('carries the given first name straight into the brief for Writer A', async () => {
    await rewriteReportForClient(mockReport, 'en', 'Maria')
    const writerACall = createMock.mock.calls.find(([params]) => params.system.includes('You are Writer A'))
    expect(writerACall).toBeDefined()
    const briefSent = JSON.parse(writerACall![0].messages[0].content)
    expect(briefSent.clientFirstName).toBe('Maria')
  })

  it('handles an empty first name gracefully (legacy rows without a name)', async () => {
    await rewriteReportForClient(mockReport, 'en', '')
    const writerACall = createMock.mock.calls.find(([params]) => params.system.includes('You are Writer A'))
    const briefSent = JSON.parse(writerACall![0].messages[0].content)
    expect(briefSent.clientFirstName).toBe('')
  })

  it('throws when the planner call fails after its retry, instead of falling back to raw text', async () => {
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return Promise.reject(new Error('planner failed'))
      }
      throw new Error('a writer must not be called when the planner fails')
    })

    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toThrow('planner failed')
    expect(createMock).toHaveBeenCalledTimes(2)
  })

  it('REGRESSION (2026-07-19 production incident): parses a Planner response whose markdown fence was never closed', async () => {
    // Reproduces the exact production failure: "content generation failed ... Unexpected
    // token '`', \"```json { \"... is not valid JSON". Most likely cause: the Planner's
    // maxTokens (1200) cut the response off before the model reached a closing ``` fence,
    // leaving a valid ```json-prefixed-but-unterminated response. The old stripJsonFence
    // required an opening AND a matching closing fence in one all-or-nothing regex match, so
    // on any mismatch it silently stripped nothing at all, leaving the literal backticks in
    // front of JSON.parse.
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return Promise.resolve({
          content: [{ type: 'text', text: '```json\n' + JSON.stringify(plannerFixture) }],
        })
      }
      return defaultCreateImpl(params)
    })

    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')
    expect(Object.keys(result)).toHaveLength(14)
  })

  it('does not retry the planner when it fails with a non-retryable billing/auth error (400 invalid_request_error) — fails fast on the first attempt', async () => {
    const billingError = Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
      { status: 400, error: { type: 'error', error: { type: 'invalid_request_error' } } },
    )
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return Promise.reject(billingError)
      }
      throw new Error('a writer must not be called when the planner fails')
    })

    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toBe(billingError)
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry the planner when it fails with a 401 authentication error — fails fast', async () => {
    const authError = Object.assign(
      new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'),
      { status: 401, error: { type: 'error', error: { type: 'authentication_error' } } },
    )
    createMock.mockImplementation((params: any) => {
      if (params.system.includes('You are the Planner')) {
        return Promise.reject(authError)
      }
      throw new Error('a writer must not be called when the planner fails')
    })

    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toBe(authError)
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('retries the planner once on failure before giving up, and proceeds normally if the retry succeeds', async () => {
    let plannerAttempts = 0
    createMock.mockImplementation((params: any) => {
      const system: string = params.system
      if (system.includes('You are the Planner')) {
        plannerAttempts += 1
        if (plannerAttempts === 1) {
          return Promise.reject(new Error('transient planner failure'))
        }
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(plannerFixture) }] })
      }
      if (system.includes('You are Writer A')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerAFixture) }] })
      }
      if (system.includes('You are Writer B')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerBFixture) }] })
      }
      if (system.includes('You are Writer C')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerCFixture) }] })
      }
      throw new Error('unexpected call')
    })

    const result = await rewriteReportForClient(mockReport, 'en', 'Jane')

    expect(result.section_1_general_terrain).toBe(writerAFixture.section_1_general_terrain)
    expect(plannerAttempts).toBe(2)
    expect(createMock).toHaveBeenCalledTimes(5)
  })

  it('throws when a writer group fails, instead of falling back for just that group', async () => {
    createMock.mockImplementation((params: any) => {
      const system: string = params.system
      if (system.includes('You are the Planner')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(plannerFixture) }] })
      }
      if (system.includes('You are Writer A')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerAFixture) }] })
      }
      if (system.includes('You are Writer B')) {
        return Promise.reject(new Error('writer B failed'))
      }
      if (system.includes('You are Writer C')) {
        return Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(writerCFixture) }] })
      }
      throw new Error('unexpected call')
    })

    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toThrow('writer B failed')
  })

  it('throws if the Anthropic client itself throws', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    vi.mocked(Anthropic).mockImplementationOnce(function () {
      return {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API error')),
        },
      } as any
    })

    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toThrow()
  })

  it('throws when no key is resolved (settings table empty AND env var unset), instead of silently returning raw text', async () => {
    mockGetAnthropicApiKey.mockResolvedValueOnce('')
    await expect(rewriteReportForClient(mockReport, 'en', 'Jane')).rejects.toThrow('ANTHROPIC_API_KEY not configured')
  })
})
