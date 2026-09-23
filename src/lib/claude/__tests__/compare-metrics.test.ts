import { describe, it, expect, vi, beforeEach } from 'vitest'

// REGRESSION (2026-09-23, same follow-up as analyze-dual-metrics.test.ts): compareIris shares
// the exact truncation-retry pattern that caused the production timeout, so it needs the same
// report_metrics instrumentation to answer "how long, and did it retry?" without log archaeology.

vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

const mockGetAIProvider = vi.fn()
const mockGetBothProviders = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => mockGetAIProvider(),
  getBothProviders: () => mockGetBothProviders(),
}))

const recordReportMetrics = vi.fn().mockResolvedValue(undefined)
vi.mock('../report-metrics', () => ({
  recordReportMetrics: (...args: unknown[]) => recordReportMetrics(...args),
}))

import { compareIris } from '../compare'
import type { ComparisonRequest } from '@/types/claude'

const request: ComparisonRequest = {
  sessionId: 'compare-session-under-test',
  patientId: 'p1',
  rightIrisBase64: 'AAA',
  leftIrisBase64: 'BBB',
  previousRightIrisBase64: 'CCC',
  previousLeftIrisBase64: 'DDD',
  previousSessionDate: '2026-01-01',
  patientData: {
    full_name: 'Jane Doe',
    date_of_birth: '1990-01-01',
    gender: null,
    general_history: null,
    symptoms: null,
    practitioner_notes: null,
  },
}

function validComparisonJson(): string {
  return JSON.stringify({
    comp_1_improvements: 'Lymphatic flow has improved since the last session.',
    comp_2_not_improved: 'Hepatic congestion persists at the same level.',
  })
}

beforeEach(() => {
  recordReportMetrics.mockClear()
  mockGetAIProvider.mockReset()
  mockGetBothProviders.mockReset()
})

describe('compareIris — report_metrics instrumentation (dual-provider path)', () => {
  it('records a completed row with per-leg timing on the clean success path', async () => {
    const anthropicComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    const openaiComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetBothProviders.mockResolvedValue({
      anthropic: { complete: anthropicComplete },
      openai: { complete: openaiComplete },
    })

    const result = await compareIris(request)

    expect('code' in result).toBe(false)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    const metrics = recordReportMetrics.mock.calls[0][0]
    expect(metrics.sessionId).toBe('compare-session-under-test')
    expect(metrics.route).toBe('compare')
    expect(metrics.outcome).toBe('completed')
    expect(metrics.claudeLegRetried).toBe(false)
    expect(metrics.openaiLegRetried).toBe(false)
    expect(metrics.synthesisRetried).toBe(false)
  })

  it('records claudeLegRetried:true when the Claude leg needed the truncation retry', async () => {
    const anthropicComplete = vi
      .fn()
      .mockResolvedValueOnce({ text: '{"comp_1_improvements": "cut off', stopReason: 'max_tokens' })
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' })
      .mockResolvedValueOnce({ text: validComparisonJson(), stopReason: 'end_turn' })
    const openaiComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetBothProviders.mockResolvedValue({
      anthropic: { complete: anthropicComplete },
      openai: { complete: openaiComplete },
    })

    await compareIris(request)

    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    expect(recordReportMetrics.mock.calls[0][0].claudeLegRetried).toBe(true)
  })

  it('records outcome:failed when the Claude leg is rejected outright', async () => {
    const anthropicComplete = vi.fn().mockRejectedValue(new Error('Claude down'))
    const openaiComplete = vi.fn().mockResolvedValue({ text: validComparisonJson(), stopReason: 'end_turn' })
    mockGetBothProviders.mockResolvedValue({
      anthropic: { complete: anthropicComplete },
      openai: { complete: openaiComplete },
    })

    const result = await compareIris(request)

    expect('code' in result).toBe(true)
    expect(recordReportMetrics).toHaveBeenCalledTimes(1)
    expect(recordReportMetrics.mock.calls[0][0].outcome).toBe('failed')
  })
})
