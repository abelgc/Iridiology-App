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

  const isPremium = tier === 'premium_19_90'

  return (
    <>
      {/* Hero */}
      <section style={{ position: 'relative', padding: '32px 20px 24px', overflow: 'hidden', textAlign: 'center' }}>
        <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
          <div className={`plan-pill${isPremium ? ' is-premium' : ''}`}>
            <span className="plan-pill-badge">
              {isPremium ? 'Premium · €19.90' : 'Essential · €12'}
            </span>
            <span>{t('intakePlanSuffix')}</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(28px, 6vw, 40px)', lineHeight: 1.05, color: '#2a3520', letterSpacing: '-0.01em', marginBottom: '10px' }}>
            {t('intakeHeroTitle')}{' '}
            <span style={{ fontStyle: 'italic', color: '#a85428', fontWeight: 400 }}>
              {t('intakeHeroAccent')}
            </span>
          </h1>
          <p style={{ fontSize: '14.5px', color: '#5d4f3f', maxWidth: '480px', margin: '0 auto', lineHeight: 1.55 }}>
            {t('intakeHeroLead')}
          </p>
        </div>
      </section>
      {/* Form */}
      <div style={{ maxWidth: '760px', margin: '24px auto 40px', padding: '0 16px' }}>
        <IntakeForm tier={tier} onSubmit={handleSubmit} />
      </div>
    </>
  )
}

export default function IntakePage() {
  return (
    <Suspense>
      <IntakeContent />
    </Suspense>
  )
}
