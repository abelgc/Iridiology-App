'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import type { PaymentTier } from '@/types/client-analysis'

export function TierSelector() {
  const { t } = useLanguage()
  const router = useRouter()

  function pick(tier: PaymentTier) {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('client_tier', tier)
    }
    router.push('/client/intake')
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-8">
      <button
        type="button"
        onClick={() => pick('basic_12')}
        className="text-left border rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        <h3 className="text-xl font-semibold">{t('tierBasicTitle')}</h3>
        <p className="text-2xl my-2">{t('tierBasicPrice')}</p>
        <p className="text-sm">{t('tierBasicDescription')}</p>
      </button>
      <button
        type="button"
        onClick={() => pick('premium_19_90')}
        className="text-left border rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        <h3 className="text-xl font-semibold">{t('tierPremiumTitle')}</h3>
        <p className="text-2xl my-2">{t('tierPremiumPrice')}</p>
        <p className="text-sm">{t('tierPremiumDescription')}</p>
      </button>
    </div>
  )
}
