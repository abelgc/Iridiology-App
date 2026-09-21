import { describe, it, expect } from 'vitest'
import { detectsCorrectLanguage } from '../language-check'

const SPANISH_TEXT =
  'Este es un texto de prueba en español para comprobar la detección de idioma correctamente, con suficiente longitud.'
const ENGLISH_TEXT =
  'This is a test text in English to check language detection correctly, with enough length to be reliable.'
const GERMAN_TEXT =
  'Dies ist ein Testtext auf Deutsch, um die Spracherkennung korrekt zu überprüfen, mit ausreichender Länge.'

describe('detectsCorrectLanguage', () => {
  it('returns true when the text is actually written in the expected language', () => {
    expect(detectsCorrectLanguage(SPANISH_TEXT, 'es')).toBe(true)
    expect(detectsCorrectLanguage(ENGLISH_TEXT, 'en')).toBe(true)
    expect(detectsCorrectLanguage(GERMAN_TEXT, 'de')).toBe(true)
  })

  it('returns false when the text is written in a different language than expected', () => {
    expect(detectsCorrectLanguage(ENGLISH_TEXT, 'es')).toBe(false)
    expect(detectsCorrectLanguage(SPANISH_TEXT, 'en')).toBe(false)
    expect(detectsCorrectLanguage(GERMAN_TEXT, 'es')).toBe(false)
  })

  it('returns true for text shorter than 50 characters regardless of language, since detection is unreliable that short', () => {
    expect(detectsCorrectLanguage('Too short.', 'es')).toBe(true)
    expect(detectsCorrectLanguage('a'.repeat(49), 'es')).toBe(true)
  })

  it('returns true for an empty or undefined-like string, never throwing', () => {
    expect(detectsCorrectLanguage('', 'es')).toBe(true)
  })
})
