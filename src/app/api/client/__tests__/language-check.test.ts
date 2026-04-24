import { describe, it, expect } from 'vitest'
import { detectsCorrectLanguage } from '../upload/language-check'

describe('detectsCorrectLanguage', () => {
  it('returns true when text is in the expected language', () => {
    expect(detectsCorrectLanguage('The digestive system shows signs of chronic stress.', 'en')).toBe(true)
  })

  it('returns false when text language does not match expected', () => {
    expect(detectsCorrectLanguage('El sistema digestivo muestra signos de estrés crónico y la función hepática está comprometida.', 'en')).toBe(false)
  })

  it('returns true for Spanish text with es lang', () => {
    expect(detectsCorrectLanguage('El sistema digestivo muestra signos de estrés crónico.', 'es')).toBe(true)
  })
})
