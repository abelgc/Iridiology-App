import { describe, it, expect } from 'vitest'
import { formatQuestionnaire } from '../analyze'

describe('formatQuestionnaire', () => {
  it('returns "None reported" when questionnaire is empty', () => {
    const result = formatQuestionnaire({})
    expect(result).toBe('None reported')
  })

  it('lists only positive (true) symptoms grouped by body system', () => {
    const result = formatQuestionnaire({
      digestive: { constipation: true, bloating: true, diarrhea: false },
      nervous: { insomnia: true },
    } as any)
    expect(result).toContain('Digestive: constipation, bloating')
    expect(result).toContain('Nervous: insomnia')
    expect(result).not.toContain('diarrhea')
  })

  it('includes free-text fields when provided', () => {
    const result = formatQuestionnaire({
      known_allergies: 'Penicillin',
      past_surgeries: 'Appendectomy 2010',
    } as any)
    expect(result).toContain('Known allergies: Penicillin')
    expect(result).toContain('Past surgeries: Appendectomy 2010')
  })

  it('returns "None reported" when questionnaire is null or undefined', () => {
    expect(formatQuestionnaire(null)).toBe('None reported')
    expect(formatQuestionnaire(undefined)).toBe('None reported')
  })
})
