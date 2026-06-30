'use client'

import { useLanguage } from '@/lib/i18n-context'
import type { Lang } from '@/lib/i18n'

const UK_FLAG = (
  <svg viewBox="0 0 18 14" preserveAspectRatio="none" width="18" height="14" style={{ borderRadius: '2px', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
    <rect width="18" height="14" fill="#012169" />
    <path d="M0,0 L18,14 M18,0 L0,14" stroke="white" strokeWidth="2.5" />
    <path d="M0,0 L18,14 M18,0 L0,14" stroke="#C8102E" strokeWidth="1.2" />
    <path d="M9,0 V14 M0,7 H18" stroke="white" strokeWidth="3" />
    <path d="M9,0 V14 M0,7 H18" stroke="#C8102E" strokeWidth="1.6" />
  </svg>
)

const ES_FLAG = (
  <svg viewBox="0 0 18 14" preserveAspectRatio="none" width="18" height="14" style={{ borderRadius: '2px', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
    <rect width="18" height="3.5" fill="#aa151b" />
    <rect y="3.5" width="18" height="7" fill="#f1bf00" />
    <rect y="10.5" width="18" height="3.5" fill="#aa151b" />
  </svg>
)

const DE_FLAG = (
  <svg viewBox="0 0 18 14" preserveAspectRatio="none" width="18" height="14" style={{ borderRadius: '2px', flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
    <rect width="18" height="4.67" fill="#000000" />
    <rect y="4.67" width="18" height="4.67" fill="#DD0000" />
    <rect y="9.33" width="18" height="4.67" fill="#FFCE00" />
  </svg>
)

const LANGS: { code: Lang; label: string; name: string; flag: React.ReactNode }[] = [
  { code: 'en', label: 'EN', name: 'English', flag: UK_FLAG },
  { code: 'es', label: 'ES', name: 'Español', flag: ES_FLAG },
  { code: 'de', label: 'DE', name: 'Deutsch', flag: DE_FLAG },
]

export function LanguageToggle() {
  const { lang, setLang } = useLanguage()

  return (
    <div
      style={{ display: 'flex', gap: '4px', background: '#f8f0df', borderRadius: '99px', padding: '4px', border: '1px solid #d8c9ad' }}
      role="group"
      aria-label="Language selector"
    >
      {LANGS.map(({ code, label, name, flag }) => {
        const active = lang === code
        return (
          <button
            key={code}
            type="button"
            aria-label={name}
            aria-pressed={active}
            onClick={() => setLang(code)}
            style={{ background: active ? '#3d4a2a' : 'none', border: 'none', cursor: 'pointer', padding: '5px 10px', borderRadius: '99px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, color: active ? '#f4ead8' : '#5d4f3f', transition: 'all 0.15s' }}
          >
            {flag}{label}
          </button>
        )
      })}
    </div>
  )
}
