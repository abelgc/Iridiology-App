'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'
import type { PaymentTier } from '@/types/client-analysis'
import type { ClientIntakeInput } from '@/lib/validators/client-intake'

export default function IntakePage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [tier, setTier] = useState<PaymentTier | null>(null)

  useEffect(() => {
    const stored = window.sessionStorage.getItem('client_tier') as PaymentTier | null
    if (stored !== 'basic_12' && stored !== 'premium_19_90') {
      router.replace('/client')
      return
    }
    setTier(stored)
  }, [router])

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
    window.sessionStorage.setItem('client_token', json.report_download_token)
    router.push('/client/intake/payment')
  }

  if (!tier) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-6">{t('intakeTitle')}</h2>
      <IntakeForm tier={tier} onSubmit={handleSubmit} />
    </section>
  )
}
