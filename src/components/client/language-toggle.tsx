'use client'

import { useLanguage } from '@/lib/i18n-context'
import { Lang } from '@/lib/i18n'

const FLAGS: Record<Lang, { label: string; emoji: string }> = {
  en: { label: 'English', emoji: '🇬🇧' },
  es: { label: 'Español', emoji: '🇪🇸' },
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <div className="flex gap-2" role="group" aria-label="Language selector">
      {(Object.keys(FLAGS) as Lang[]).map((code) => {
        const active = lang === code
        return (
          <button
            key={code}
            type="button"
            aria-label={FLAGS[code].label}
            aria-pressed={active}
            onClick={() => setLang(code)}
            className={`text-2xl rounded-md px-2 py-1 transition-opacity ${
              active ? 'opacity-100 ring-2 ring-current' : 'opacity-60 hover:opacity-100'
            }`}
          >
            <span aria-hidden>{FLAGS[code].emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
