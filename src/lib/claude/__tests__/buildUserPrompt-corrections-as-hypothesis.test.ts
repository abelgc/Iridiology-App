import { describe, it, expect } from 'vitest'
import { buildUserPrompt } from '../analyze'
import type { AnalysisRequest } from '@/types/claude'

// Regression tests for P3 ("notes treated as dogma") AND its follow-up correction: the
// practitioner is a certified iridologist — their clinical hypothesis and prior corrections
// must be grounded in real iris evidence (not echoed verbatim as fact — the original bug),
// but never flatly contradicted or denied either (the first fix's overcorrection, caught
// against the real Wendy case). Patient-reported symptoms stay fully skeptical: the iris can
// explicitly say "no support found" there. Calls the real production buildUserPrompt() with
// no mocks; assertions are on the actual prompt text the model receives.

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

describe('buildUserPrompt — practitioner input is grounded, never denied; patient input stays skeptical', () => {
  it('grounds the practitioner clinical hypothesis in iris evidence without permitting flat contradiction', () => {
    const request = baseRequest({ practitioner_notes: 'I think hepatic burden is the main thing to tackle' })

    const prompt = buildUserPrompt(request, null, null, null)

    expect(prompt).toContain('I think hepatic burden is the main thing to tackle')
    expect(prompt).toContain('from a certified iridologist, carrying real clinical weight')
    expect(prompt).toContain('ground it in the specific iris evidence you observe')
    expect(prompt).toContain('do not flatly contradict it')
    expect(prompt).not.toContain('confirm, contradict, or nuance')
  })

  it('grounds prior practitioner corrections in iris evidence rather than denying or literally repeating them', () => {
    const request = baseRequest()
    const priorCorrections =
      'Section section_7_hepatic: Severe hepatic congestion, most likely toxic overload. (Practitioner note: confirmed by patient fatigue)'

    const prompt = buildUserPrompt(request, null, priorCorrections, null)

    expect(prompt).toContain(priorCorrections)
    expect(prompt).toContain("the practitioner's own prior clinical judgement, carrying real weight")
    expect(prompt).toContain('rather than denying it')
    expect(prompt).not.toContain('if the iris does not support a prior correction, say so plainly')
  })

  it('frames the reported "current symptoms" field with full skepticism — this is the exact line the client main_complaint lands on', () => {
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
