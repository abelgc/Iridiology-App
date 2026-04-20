import { describe, it, expect } from 'vitest'
import { translations, t, detectLocale } from '@/lib/i18n'

describe('i18n', () => {
  it('exposes en and es dictionaries with matching keys', () => {
    const enKeys = Object.keys(translations.en).sort()
    const esKeys = Object.keys(translations.es).sort()
    expect(enKeys).toEqual(esKeys)
  })

  it('t() returns the string for the given lang and key', () => {
    expect(t('en', 'continue')).toBe('Continue')
    expect(t('es', 'continue')).toBe('Continuar')
  })

  it('t() returns the key itself when missing (so missing strings are visible in QA)', () => {
    // @ts-expect-error intentional: testing fallback
    expect(t('en', 'definitely_missing_key')).toBe('definitely_missing_key')
  })

  it('detectLocale defaults to en for non-spanish locales', () => {
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('fr-FR')).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })

  it('detectLocale returns es for any es-* locale', () => {
    expect(detectLocale('es-MX')).toBe('es')
    expect(detectLocale('es-ES')).toBe('es')
    expect(detectLocale('es')).toBe('es')
  })
})
