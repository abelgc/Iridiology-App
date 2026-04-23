'use client'

import { useLanguage } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'
import { TierSelector } from '@/components/client/tier-selector'

export default function ClientEntryPage() {
  const { t } = useLanguage()

  return (
    <section>
      <h2
        className="text-3xl font-semibold"
        style={{ fontFamily: 'var(--font-serif)', color: 'oklch(0.22 0.04 50)' }}
      >
        {t('chooseTier')}
      </h2>

      <div className="mt-3">
        <LanguageToggle />
      </div>

      <TierSelector />
    </section>
  )
}
