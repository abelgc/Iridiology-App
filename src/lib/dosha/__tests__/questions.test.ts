import { describe, it, expect } from 'vitest'
import { DOSHA_QUESTIONS, localize } from '@/lib/dosha/questions'

const ENGLISH_PROMPTS = [
  'What has your natural body frame been most of your life?',
  'What has your natural weight pattern been?',
  'What has your skin naturally tended toward?',
  'What has your hair naturally tended toward?',
  'What best describes your natural eyes or gaze?',
  'What has your natural appetite been like?',
  'What has your digestion naturally been like?',
  'What has your natural bowel pattern been?',
  'What has your natural temperature tendency been?',
  'What has your natural sleep pattern been?',
  'What has your natural energy pattern been?',
  'What has your natural pace been?',
  'What is your natural communication style?',
  'How have you naturally learned best?',
  'What has your natural memory pattern been?',
  'What emotion have you naturally leaned toward under strain?',
  'How do you naturally respond to stress?',
  'What is your natural decision-making style?',
  'What has your natural social energy been?',
  'What has your natural work rhythm been?',
  'What has your natural planning style been?',
  'What has your natural relationship to routine been?',
  'What have you naturally been most sensitive to?',
  'What have you naturally craved when off balance?',
  'What recurring body pattern has been most familiar?',
  'What has your natural resilience pattern been?',
  'What is usually your first sign of imbalance?',
]

describe('dosha questions', () => {
  it('lists the teacher questions that were actually supplied, in order, with Spanish and German', () => {
    expect(DOSHA_QUESTIONS).toHaveLength(27)
    expect(DOSHA_QUESTIONS.map((question) => question.prompt.en)).toEqual(ENGLISH_PROMPTS)
    expect(DOSHA_QUESTIONS.slice(7, 15).map((question) => question.id)).toEqual([
      'elimination',
      'temperature',
      'sleep',
      'energy',
      'movement-pace',
      'speech-style',
      'learning-style',
      'memory-pattern',
    ])
    const ids = DOSHA_QUESTIONS.map((question) => question.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const question of DOSHA_QUESTIONS) {
      for (const text of [question.category, question.prompt, ...Object.values(question.options)]) {
        expect(text.en.trim().length).toBeGreaterThan(0)
        expect(text.es.trim().length).toBeGreaterThan(0)
        expect(text.de.trim().length).toBeGreaterThan(0)
        expect(text.de).not.toBe(text.en)
      }
      expect(Object.keys(question.options)).toEqual(['vata', 'pitta', 'kapha'])
    }
  })

  it('scores question 24 by position: the grounding option is vata', () => {
    const cravings = DOSHA_QUESTIONS.find((question) => question.id === 'cravings')
    expect(cravings?.options.vata.en).toBe('Warm, soft, grounding foods')
    expect(cravings?.options.pitta.en).toBe('Cooling or refreshing foods')
    expect(cravings?.options.kapha.en).toBe('Light, spicy, or energizing foods')
  })

  it('returns the string for the selected language', () => {
    const text = { en: 'Hello', es: 'Hola', de: 'Hallo' }
    expect(localize(text, 'en')).toBe('Hello')
    expect(localize(text, 'es')).toBe('Hola')
    expect(localize(text, 'de')).toBe('Hallo')
  })
})
