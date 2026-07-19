import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the provider layer so we control exactly what analyzeIris's catch block sees.
const mockComplete = vi.fn()
vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => Promise.resolve({ complete: mockComplete }),
}))

// buildPatientContext hits Supabase — stub it out with empty context.
vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

import { analyzeIris } from '../analyze'
import type { AnalysisRequest } from '@/types/claude'

const request: AnalysisRequest = {
  sessionId: 's1',
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

function anthropicBillingError() {
  return Object.assign(
    new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
    {
      status: 400,
      error: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } },
    },
  )
}

beforeEach(() => {
  mockComplete.mockReset()
})

describe('analyzeIris — non-retryable vs retryable provider errors', () => {
  it('fails fast (no retry) on a 400 invalid_request_error and tags the failure reason', async () => {
    mockComplete.mockRejectedValue(anthropicBillingError())

    const result = await analyzeIris(request)

    expect(mockComplete).toHaveBeenCalledTimes(1)
    expect('code' in result && result.code).toBe('analysis_failed')
    expect('message' in result && result.message).toMatch(/^billing_or_auth_error: /)
    expect('message' in result && result.message).toContain('credit balance is too low')
  })

  it('still retries once on a genuine timeout, unchanged from existing behavior', async () => {
    vi.useFakeTimers()
    try {
      let attempt = 0
      mockComplete.mockImplementation(() => {
        attempt += 1
        if (attempt === 1) return Promise.reject(new Error('Request ETIMEDOUT'))
        return Promise.resolve({
          text: JSON.stringify({
            section_1_general_terrain: 'x',
            section_2_emotional_field: 'x',
            section_3_cognitive_nervous: 'x',
            section_4_immune_lymphatic: 'x',
            section_5_endocrine_hormonal: 'x',
            section_6_circulatory_cardiorespiratory: 'x',
            section_7_hepatic: 'x',
            section_8_digestive_intestinal: 'x',
            section_9_renal_urinary: 'x',
            section_10_structural_integumentary: 'x',
            section_11_detected_axes: 'x',
            section_12_conclusion: 'x',
            section_13_strengths_of_the_body: 'x',
            section_14_recommendations: 'x',
            section_15_iris_sign_patterns: 'x',
          }),
          stopReason: 'end_turn',
        })
      })

      const resultPromise = analyzeIris(request)
      await vi.advanceTimersByTimeAsync(5000) // the catch block's 5s pre-retry delay
      const result = await resultPromise

      expect(mockComplete).toHaveBeenCalledTimes(2)
      expect('code' in result).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
