'use client'

import { Suspense } from 'react'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'
import type { PaymentTier } from '@/types/client-analysis'
import type { ClientIntakeInput } from '@/lib/validators/client-intake'

function IntakeContent() {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tier = searchParams.get('tier') as PaymentTier | null

  useEffect(() => {
    if (tier !== 'basic_12' && tier !== 'premium_19_90') {
      router.replace('/client')
    }
  }, [tier, router])

  async function handleSubmit(data: ClientIntakeInput) {
    const res = await fetch('/api/client/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      alert(t('error'))
      return
    }
    const json = (await res.json()) as { report_download_token: string }
    router.push(`/client/intake/payment?token=${json.report_download_token}`)
  }

  if (tier !== 'basic_12' && tier !== 'premium_19_90') return null
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-6">{t('intakeTitle')}</h2>
      <IntakeForm tier={tier} onSubmit={handleSubmit} />
    </section>
  )
}

export default function IntakePage() {
  return (
    <Suspense>
      <IntakeContent />
    </Suspense>
  )
}
