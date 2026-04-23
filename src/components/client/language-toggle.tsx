'use client'

import { useLanguage } from '@/lib/i18n-context'
import type { Lang } from '@/lib/i18n'

const LANGS: { code: Lang; label: string }[] = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
]

export function LanguageToggle() {
  const { lang, setLang } = useLanguage()

  return (
    <div className="flex gap-2" role="group" aria-label="Language selector">
      {LANGS.map(({ code, label }) => {
        const active = lang === code
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(code)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: active ? '#f5a623' : 'transparent',
              color: active ? '#ffffff' : 'oklch(0.50 0.03 60)',
              border: '1px solid',
              borderColor: active ? 'transparent' : 'rgba(0,0,0,0.15)',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
