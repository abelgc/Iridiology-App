import { describe, it, expect, vi, beforeEach } from 'vitest'

// REGRESSION (2026-09-23, follow-up to the 280s production timeout / session f666e4d4):
// there was no way to answer "how long did this analysis take, and did it need the
// truncation retry?" without manually joining Supabase timestamps against raw Vercel logs —
// which were themselves inaccessible for hours during that investigation. This asserts every
// exit path of analyzeIrisDual records its timing/retry shape to report_metrics.

vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

const recordReportMetrics = vi.fn().mockResolvedValue(undefined)
vi.mock('../report-metrics', () => ({
  recordReportMetrics: (...args: unknown[]) => recordReportMetrics(...args),
}))

import { analyzeIrisDual } from '../analyze-dual'
import type { AnalysisRequest } from '@/types/claude'

const request: AnalysisRequest = {
  sessionId: 'session-under-test',
  patientId: 'p1',
  rightIrisBase64: 'AAA',
  leftIrisBase64: 'BBB',
  patientData: {
    full_name: 'Jane Doe',
    date_of_birth: '1990-01-01',
    gender: null,
    general_history: null,
    symptoms: null,
    practitioner_notes: null,
  },
}

const ALL_15_KEYS = [
  'section_1_general_terrain', 'section_2_emotional_field', 'section_3_cognitive_nervous',
  'section_4_immune_lymphatic', 'section_5_endocrine_hormonal', 'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic', 'section_8_digestive_intestinal', 'section_9_renal_urinary',
  'section_10_structural_integumentary', 'section_11_detected_axes', 'section_12_conclusion',
  'section_13_strengths_of_the_body', 'section_14_recommendations', 'section_15_iris_sign_patterns',
]

function validReportJson(): string {
  const obj: Record<string, string> = {}
  for (const key of ALL_15_KEYS) obj[key] = `Content for ${key}.`
  return JSON.stringify(obj)
}

beforeEach(() => {
  recordReportMetrics.mockClear()
})

describe('analyzeIrisDual — report_metrics instrumentation', () => {
  it('records a completed row with per-leg timing and retried:false on the clean success path', async () => {
    const anthropic = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result).toBe(false)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    const metrics = recordReportMetrics.mock.calls[0][0]
    expect(metrics.sessionId).toBe('session-under-test')
    expect(metrics.route).toBe('analyze')
    expect(metrics.outcome).toBe('completed')
    expect(metrics.claudeLegRetried).toBe(false)
    expect(metrics.openaiLegRetried).toBe(false)
    expect(metrics.synthesisRetried).toBe(false)
    expect(typeof metrics.claudeLegMs).toBe('number')
    expect(typeof metrics.openaiLegMs).toBe('number')
    expect(typeof metrics.synthesisMs).toBe('number')
    expect(typeof metrics.totalMs).toBe('number')
  })

  it('records claudeLegRetried:true when the Claude leg needed the truncation retry', async () => {
    const anthropic = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({ text: 'cut off half', stopReason: 'max_tokens' })
        .mockResolvedValueOnce({ text: validReportJson(), stopReason: 'end_turn' })
        .mockResolvedValueOnce({ text: validReportJson(), stopReason: 'end_turn' }), // synthesis
    }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    await analyzeIrisDual(request, 'en', { providers: { anthropic: anthropic as any, openai: openai as any } })

    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    expect(recordReportMetrics.mock.calls[0][0].claudeLegRetried).toBe(true)
  })

  it('records outcome:failed when the Claude leg is rejected outright', async () => {
    const anthropic = { complete: vi.fn().mockRejectedValue(new Error('Claude down')) }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result).toBe(true)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    expect(recordReportMetrics.mock.calls[0][0].outcome).toBe('failed')
  })

  it('records a completed row (Claude-only) when the OpenAI leg is rejected', async () => {
    const anthropic = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }
    const openai = { complete: vi.fn().mockRejectedValue(new Error('OpenAI down')) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result).toBe(false)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    const metrics = recordReportMetrics.mock.calls[0][0]
    expect(metrics.outcome).toBe('completed')
    expect(typeof metrics.claudeLegMs).toBe('number')
    expect(metrics.openaiLegMs).toBeUndefined()
  })

  it('records synthesisRetried:true when synthesis is truncated twice and falls back to Claude-only', async () => {
    const anthropic = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({ text: validReportJson(), stopReason: 'end_turn' }) // Claude leg
        .mockResolvedValueOnce({ text: 'cut off', stopReason: 'max_tokens' }) // synthesis attempt
        .mockResolvedValueOnce({ text: 'still cut off', stopReason: 'max_tokens' }), // synthesis retry
    }
    const openai = { complete: vi.fn().mockResolvedValue({ text: validReportJson(), stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result).toBe(false)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    const metrics = recordReportMetrics.mock.calls[0][0]
    expect(metrics.outcome).toBe('completed')
    expect(metrics.synthesisRetried).toBe(true)
  })
})
