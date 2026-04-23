'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import type { PaymentTier } from '@/types/client-analysis'

export function TierSelector() {
  const { t } = useLanguage()
  const router = useRouter()
  const [selected, setSelected] = useState<PaymentTier | null>(null)

  function pick(tier: PaymentTier) {
    setSelected(tier)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('client_tier', tier)
    }
    setTimeout(() => router.push('/client/intake'), 200)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-8">
      <button
        type="button"
        onClick={() => pick('basic_12')}
        className={`tier-card${selected === 'basic_12' ? ' selected' : ''}`}
      >
        <p className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
          {t('tierBasicPrice')}
        </p>
        <h3 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          {t('tierBasicTitle')}
        </h3>
        <p className="text-sm leading-relaxed">{t('tierBasicDescription')}</p>
      </button>

      <button
        type="button"
        onClick={() => pick('premium_19_90')}
        className={`tier-card${selected === 'premium_19_90' ? ' selected' : ''}`}
      >
        <p className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
          {t('tierPremiumPrice')}
        </p>
        <h3 className="text-xl font-semibold mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          {t('tierPremiumTitle')}
        </h3>
        <p className="text-sm leading-relaxed">{t('tierPremiumDescription')}</p>
      </button>
    </div>
  )
}
