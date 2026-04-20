'use client'

import { useLanguage } from '@/lib/i18n-context'

export default function ProcessingPage() {
  const { t } = useLanguage()
  return (
    <section className="text-center py-16">
      <p className="text-lg">{t('uploadAnalyzing')}</p>
      <p className="text-sm opacity-60 mt-2">{t('loading')}</p>
    </section>
  )
}
