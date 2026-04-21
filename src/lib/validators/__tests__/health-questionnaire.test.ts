import { describe, it, expect } from 'vitest'
import { healthQuestionnaireSchema } from '../health-questionnaire'

describe('healthQuestionnaireSchema', () => {
  it('accepts an empty object and defaults all booleans to false', () => {
    const result = healthQuestionnaireSchema.safeParse({})
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.digestive.constipation).toBe(false)
    expect(result.data.nervous.insomnia).toBe(false)
  })

  it('accepts true for any boolean field', () => {
    const result = healthQuestionnaireSchema.safeParse({
      digestive: { bloating: true, constipation: true },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.digestive.bloating).toBe(true)
    expect(result.data.digestive.constipation).toBe(true)
    expect(result.data.digestive.diarrhea).toBe(false) // defaulted
  })

  it('accepts optional free-text fields', () => {
    const result = healthQuestionnaireSchema.safeParse({
      known_allergies: 'Penicillin',
      past_surgeries: 'Appendectomy 2010',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.known_allergies).toBe('Penicillin')
  })

  it('rejects non-boolean values for symptom fields', () => {
    const result = healthQuestionnaireSchema.safeParse({
      digestive: { constipation: 'yes' },
    })
    expect(result.success).toBe(false)
  })
})
