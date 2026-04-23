'use client'

import { useLanguage } from '@/lib/i18n-context'
import { TierSelector } from '@/components/client/tier-selector'
import type { Lang } from '@/lib/i18n'

const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: 'es', flag: '🇪🇸', label: 'ES' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
]

export default function ClientEntryPage() {
  const { lang, setLang, t } = useLanguage()

  return (
    <section>
      <h2
        className="text-3xl font-semibold"
        style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.22 0.04 50)' }}
      >
        {t('chooseTier')}
      </h2>

      <div className="flex items-center gap-3 mt-3">
        <p className="text-sm" style={{ color: '#8a7a6a' }}>
          {t('chooseLanguage')}
        </p>
        <div className="flex gap-2">
          {LANGS.map(({ code, flag, label }) => {
            const active = lang === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={active}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all"
                style={{
                  background: active ? '#f5a623' : 'transparent',
                  color: active ? '#ffffff' : '#8a7a6a',
                  border: '1px solid',
                  borderColor: active ? 'transparent' : 'rgba(0,0,0,0.15)',
                }}
              >
                <span>{flag}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <TierSelector />
    </section>
  )
}
