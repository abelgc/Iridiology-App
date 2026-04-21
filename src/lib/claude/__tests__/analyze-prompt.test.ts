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
      medications_supplements: 'Metformin 500mg',
      known_allergies: 'Penicillin',
    } as any)
    expect(result).toContain('Medications/supplements: Metformin 500mg')
    expect(result).toContain('Known allergies: Penicillin')
  })

  it('returns "None reported" when questionnaire is null or undefined', () => {
    expect(formatQuestionnaire(null)).toBe('None reported')
    expect(formatQuestionnaire(undefined)).toBe('None reported')
  })
})
