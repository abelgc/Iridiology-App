'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { Lang, t as translate, TranslationKey, detectLocale } from './i18n'

const STORAGE_KEY = 'iridology_lang'

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: ReactNode
  initialLang?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? 'en')

  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null) as Lang | null
    if (stored === 'en' || stored === 'es' || stored === 'de') {
      setLangState(stored)
      return
    }
    setLangState(detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined))
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: (key) => translate(lang, key) }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
