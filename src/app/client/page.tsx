'use client'

import { useLanguage } from '@/lib/i18n-context'
import { TierSelector } from '@/components/client/tier-selector'

export default function ClientEntryPage() {
  const { t } = useLanguage()
  return (
    <section>
      <h2 className="text-2xl font-semibold">{t('chooseTier')}</h2>
      <p className="text-sm opacity-80 mt-2">{t('chooseLanguage')}</p>
      <TierSelector />
    </section>
  )
}
