import { describe, it, expect } from 'vitest'
import { buildUserPrompt } from '../analyze'
import type { AnalysisRequest } from '@/types/claude'

// Regression test for P3 ("notes treated as dogma"): practitioner corrections from previous
// reports, and the client's self-reported main complaint (which lands on the same `symptoms`
// field for the /client flow), must reach the model framed as hypotheses to re-verify against
// the iris — not as established facts. Calls the real production buildUserPrompt() with no
// mocks; the assertions are on the actual prompt text the model receives, which is the only
// observable output available without a live model call.

function baseRequest(overrides: Partial<AnalysisRequest['patientData']> = {}): AnalysisRequest {
  return {
    sessionId: 's1',
    patientId: 'p1',
    rightIrisBase64: 'x',
    leftIrisBase64: 'x',
    patientData: {
      full_name: 'Wendy',
      date_of_birth: null,
      gender: null,
      general_history: null,
      symptoms: null,
      practitioner_notes: null,
      ...overrides,
    },
    health_questionnaire: null,
  }
}

describe('buildUserPrompt — P3 practitioner corrections and client symptoms as hypotheses', () => {
  it('frames prior practitioner corrections as hypotheses to re-verify, not facts to reproduce', () => {
    const request = baseRequest()
    const priorCorrections =
      'Section section_7_hepatic: Severe hepatic congestion, most likely toxic overload. (Practitioner note: confirmed by patient fatigue)'

    const prompt = buildUserPrompt(request, null, priorCorrections, null)

    // The correction text itself must still reach the model...
    expect(prompt).toContain(priorCorrections)
    // ...but framed as a hypothesis to re-verify, and permitted to be contradicted.
    expect(prompt).toContain("treat as the practitioner's prior hypotheses")
    expect(prompt).toContain('not facts to reproduce')
    expect(prompt).toContain('if the iris does not support a prior correction, say so plainly')
  })

  it('frames the reported "current symptoms" field the same way — this is the exact line the client main_complaint lands on', () => {
    const request = baseRequest({ symptoms: 'Chronic fatigue and anxiety' })

    const prompt = buildUserPrompt(request, null, null, null)

    expect(prompt).toContain('Chronic fatigue and anxiety')
    expect(prompt).toContain('a hypothesis to check against the iris')
    expect(prompt).toContain('not a finding to confirm')
  })

  it('no longer instructs the model to prioritise matching its own past output', () => {
    const request = baseRequest()
    const prompt = buildUserPrompt(request, 'Previous findings summary', null, null)

    expect(prompt).not.toContain('Maintain consistency with previous findings')
    expect(prompt).toContain('prior hypotheses, not established facts')
    expect(prompt).toContain('re-derive every conclusion from these iris images independently')
  })
})
