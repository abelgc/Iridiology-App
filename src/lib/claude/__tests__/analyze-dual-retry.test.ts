import { describe, it, expect, vi } from 'vitest'

vi.mock('../context', () => ({
  buildPatientContext: () => Promise.resolve({ previousReportSummary: null, practitionerCorrections: null }),
}))

import { analyzeIrisDual } from '../analyze-dual'
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
      error: { type: 'error', error: { type: 'invalid_request_error' } },
    },
  )
}

describe('analyzeIrisDual — Claude-leg rejection message tagging', () => {
  it('tags the failure message with billing_or_auth_error when Claude rejects with a 400 invalid_request_error', async () => {
    const anthropic = { complete: vi.fn().mockRejectedValue(anthropicBillingError()) }
    const openai = { complete: vi.fn().mockResolvedValue({ text: '{}', stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result && result.code).toBe('analysis_failed')
    expect('message' in result && result.message).toMatch(/^billing_or_auth_error: /)
    expect('message' in result && result.message).toContain('credit balance is too low')
  })

  it('leaves the message untagged for a genuinely transient Claude-leg failure', async () => {
    const anthropic = { complete: vi.fn().mockRejectedValue(new Error('ECONNRESET')) }
    const openai = { complete: vi.fn().mockResolvedValue({ text: '{}', stopReason: 'end_turn' }) }

    const result = await analyzeIrisDual(request, 'en', {
      providers: { anthropic: anthropic as any, openai: openai as any },
    })

    expect('code' in result && result.code).toBe('analysis_failed')
    expect('message' in result && result.message).toBe('ECONNRESET')
  })
})
