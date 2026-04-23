'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export type ReportTier = 'basic' | 'premium'

interface ReportTierSelectorProps {
  value?: ReportTier | null
  onChange?: (tier: ReportTier) => void
  language?: 'es' | 'en'
}

const ORANGE = '#f5a623'

const tiers = {
  basic: {
    id: 'basic' as const,
    title: { es: 'Informe Básico', en: 'Basic Report' },
    price: { es: '€29', en: '$29' },
    description: {
      es: 'Análisis completo del iris con los hallazgos principales y recomendaciones generales de salud.',
      en: 'Full iris analysis with main findings and general health recommendations.',
    },
    features: {
      es: ['Análisis de ambos iris', 'Informe PDF descargable', 'Hallazgos principales'],
      en: ['Both irises analyzed', 'Downloadable PDF report', 'Key findings'],
    },
  },
  premium: {
    id: 'premium' as const,
    title: { es: 'Informe Premium', en: 'Premium Report' },
    price: { es: '€59', en: '$59' },
    description: {
      es: 'Análisis detallado con interpretación profunda, plan de salud personalizado y seguimiento.',
      en: 'Detailed analysis with deep interpretation, personalized health plan and follow-up.',
    },
    features: {
      es: ['Todo lo del Básico', 'Plan de salud personalizado', 'Consulta de seguimiento', 'Prioridad de respuesta'],
      en: ['Everything in Basic', 'Personalized health plan', 'Follow-up consultation', 'Priority response'],
    },
  },
}

function TierCard({
  tier,
  lang,
  selected,
  onClick,
}: {
  tier: (typeof tiers)[ReportTier]
  lang: 'es' | 'en'
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-pressed={selected}
      style={{
        background: active ? ORANGE : undefined,
        borderColor: active ? 'transparent' : undefined,
        transition: 'background 0.25s ease, border-color 0.25s ease',
      }}
      className={cn(
        'relative w-full text-left rounded-2xl border border-border bg-background p-8 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      {selected && (
        <span
          className="absolute top-4 right-4 flex items-center justify-center w-6 h-6 rounded-full"
          style={{ background: 'rgba(255,255,255,0.3)' }}
        >
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </span>
      )}

      <p
        className="text-3xl mb-1"
        style={{
          fontFamily: 'var(--font-serif)',
          color: active ? '#ffffff' : undefined,
          transition: 'color 0.25s ease',
        }}
      >
        {tier.price[lang]}
      </p>

      <h3
        className="text-xl font-semibold mb-3"
        style={{
          fontFamily: 'var(--font-serif)',
          color: active ? '#ffffff' : undefined,
          transition: 'color 0.25s ease',
        }}
      >
        {tier.title[lang]}
      </h3>

      <p
        className="text-sm leading-relaxed mb-5"
        style={{
          color: active ? 'rgba(255,255,255,0.9)' : 'oklch(0.50 0.03 60)',
          transition: 'color 0.25s ease',
        }}
      >
        {tier.description[lang]}
      </p>

      <ul className="space-y-2">
        {tier.features[lang].map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-2 text-sm"
            style={{
              color: active ? 'rgba(255,255,255,0.85)' : 'oklch(0.40 0.04 55)',
              transition: 'color 0.25s ease',
            }}
          >
            <span
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs"
              style={{
                background: active ? 'rgba(255,255,255,0.25)' : 'oklch(0.88 0.02 80)',
              }}
            >
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
    </button>
  )
}

export function ReportTierSelector({ value, onChange, language = 'es' }: ReportTierSelectorProps) {
  const [selected, setSelected] = useState<ReportTier | null>(value ?? null)

  const handleSelect = (tier: ReportTier) => {
    setSelected(tier)
    onChange?.(tier)
  }

  return (
    <section className="space-y-4">
      <div>
        <h2
          className="text-3xl font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {language === 'es' ? 'Elige tu informe' : 'Choose your report'}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'oklch(0.50 0.03 60)' }}>
          {language === 'es' ? 'Elige tu idioma' : 'Choose your language'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(Object.values(tiers) as (typeof tiers)[ReportTier][]).map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            lang={language}
            selected={selected === tier.id}
            onClick={() => handleSelect(tier.id)}
          />
        ))}
      </div>
    </section>
  )
}
