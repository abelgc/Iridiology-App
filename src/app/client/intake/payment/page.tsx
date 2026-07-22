'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { formatTierPrice, formatTierPriceParts, type PaymentTier } from '@/types/client-analysis'

type DiscountState = 'idle' | 'checking' | 'applied' | 'error'

function StepDot({ done, active, num, label }: { done?: boolean; active?: boolean; num: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', color: active ? '#3d4a2a' : '#5d4f3f', textTransform: 'uppercase' }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
        background: done ? '#5a6e3a' : active ? '#3d4a2a' : '#ecdfc6',
        color: done || active ? '#fff' : '#5d4f3f',
        border: done || active ? 'none' : '1px solid #d8c9ad',
      }}>
        {done ? '✓' : num}
      </span>
      <span>{label}</span>
    </div>
  )
}

function PaymentContent() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const tier = searchParams.get('tier') as PaymentTier | null

  const [submitting, setSubmitting] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [discountState, setDiscountState] = useState<DiscountState>('idle')
  const [discountError, setDiscountError] = useState<string | null>(null)

  const validTier = tier === 'basic_1990' || tier === 'premium_2990'

  useEffect(() => {
    if (!token || !validTier) {
      router.replace('/client')
    }
  }, [token, validTier, router])

  if (!token || !validTier) return null

  const isPremium = tier === 'premium_2990'
  const isFree = discountState === 'applied'
  const price = formatTierPriceParts(tier as PaymentTier, lang)

  async function handleApplyDiscount() {
    const code = discountCode.trim()
    if (!code) {
      setDiscountState('error')
      setDiscountError(t('paymentDiscountErrorEmpty'))
      return
    }
    setDiscountState('checking')
    try {
      const res = await fetch('/api/client/payment/discount-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = (await res.json()) as { valid?: boolean }
      if (res.ok && json.valid) {
        setDiscountState('applied')
        setDiscountError(null)
      } else {
        setDiscountState('error')
        setDiscountError(t('paymentDiscountErrorInvalid'))
      }
    } catch {
      setDiscountState('error')
      setDiscountError(t('error'))
    }
  }

  function handleRemoveDiscount() {
    setDiscountState('idle')
    setDiscountCode('')
    setDiscountError(null)
  }

  async function handleContinue() {
    if (!token) return
    setSubmitting(true)
    const res = await fetch('/api/client/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_download_token: token }),
    })
    setSubmitting(false)
    if (!res.ok) {
      alert(t('error'))
      return
    }
    router.push(`/client/upload?token=${token}`)
  }

  return (
    <>
      {/* Steps */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '20px 16px 4px', flexWrap: 'wrap' }}>
        <StepDot done num={1} label={t('paymentStepPlan')} />
        <span style={{ width: 22, height: 1, background: '#d8c9ad' }} />
        <StepDot done num={2} label={t('paymentStepDetails')} />
        <span style={{ width: 22, height: 1, background: '#d8c9ad' }} />
        <StepDot active num={3} label={t('paymentStepPayment')} />
        <span style={{ width: 22, height: 1, background: '#d8c9ad' }} />
        <StepDot num={4} label={t('paymentStepReading')} />
      </div>

      {/* Heading */}
      <div style={{ textAlign: 'center', padding: '10px 20px 4px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'clamp(26px, 5.5vw, 36px)', color: '#2a3520', letterSpacing: '-0.01em' }}>
          {t('paymentHeadTitle')}{' '}
          <span style={{ fontStyle: 'italic', color: '#a85428', fontWeight: 400 }}>{t('paymentHeadAccent')}</span>
        </h1>
        <p style={{ fontSize: 14, color: '#5d4f3f', marginTop: 6 }}>{t('paymentHeadSub')}</p>
      </div>

      <div style={{ maxWidth: 480, margin: '20px auto 48px', padding: '0 16px' }}>
        <section style={{ background: '#f8f0df', border: '1px solid #d8c9ad', borderRadius: 20, padding: '24px 22px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: '#2a3520', marginBottom: 16 }}>
            {t('paymentPanelSummary')}
          </h2>

          {/* Plan */}
          <div style={{ display: 'flex', gap: 14, paddingBottom: 16, borderBottom: '1px dashed #d8c9ad', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: '#2a3520' }}>
                {t(isPremium ? 'tierPremiumTitle' : 'tierBasicTitle')}
              </div>
              <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a85428', marginTop: 4 }}>
                {t(isPremium ? 'tierPremiumTag' : 'tierBasicTag')}
              </span>
              <p style={{ fontSize: 12, color: '#5d4f3f', marginTop: 5, lineHeight: 1.45 }}>
                {t(isPremium ? 'tierPremiumDescription' : 'tierBasicDescription')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/client')}
              style={{ fontSize: 11.5, fontWeight: 600, color: '#a85428', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}
            >
              {t('paymentChange')}
            </button>
          </div>

          {/* Discount code */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3d4a2a', marginBottom: 6 }}>
              {t('paymentDiscountLabel')}
            </label>
            {isFree ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(90,110,58,0.12)', border: '1px solid rgba(90,110,58,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#3d4a2a', fontWeight: 600 }}>
                <span>{t('paymentDiscountApplied')}</span>
                <button
                  type="button"
                  onClick={handleRemoveDiscount}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#5d4f3f', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}
                >
                  {t('paymentDiscountRemove')}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder={t('paymentDiscountPlaceholder')}
                    style={{ flex: 1, height: 44, background: '#fffdf8', border: '1.5px solid #d8c9ad', borderRadius: 10, padding: '0 12px', fontSize: 14, color: '#2a1f14' }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyDiscount}
                    disabled={discountState === 'checking'}
                    style={{ height: 44, padding: '0 18px', border: '1.5px solid #3d4a2a', background: 'transparent', color: '#3d4a2a', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {t('paymentDiscountApply')}
                  </button>
                </div>
                {discountState === 'error' && discountError && (
                  <p style={{ fontSize: 12, color: '#b4442f', marginTop: 8 }}>{discountError}</p>
                )}
              </>
            )}
          </div>

          {/* Totals */}
          <div style={{ borderTop: '1px dashed #d8c9ad', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14, color: '#5d4f3f', marginBottom: 10 }}>
              <span>{t('paymentSubtotal')}</span>
              <span style={{ color: '#2a1f14', fontWeight: 500 }}>{formatTierPrice(tier as PaymentTier, lang)}</span>
            </div>
            {isFree && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14, color: '#5a6e3a', marginBottom: 10 }}>
                <span>{t('paymentDiscountRowLabel')}</span>
                <span style={{ fontWeight: 600 }}>−{formatTierPrice(tier as PaymentTier, lang)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #d8c9ad', paddingTop: 14, marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: '#2a3520' }}>{t('paymentTotalDue')}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: '#2a3520', letterSpacing: '-0.01em' }}>
                {isFree ? '€0' : `€${price.whole}${price.decimal}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={submitting}
            style={{
              width: '100%', marginTop: 18, height: 54, border: 'none', borderRadius: 13,
              background: isFree ? '#3d4a2a' : '#c66a3d', color: '#fff', fontFamily: 'inherit', fontSize: 15.5, fontWeight: 700,
              letterSpacing: '0.03em', cursor: 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? t('loading') : isFree ? t('paymentCtaFree') : t('paymentCta')}
          </button>

          <p style={{ textAlign: 'center', fontSize: 11.5, color: '#5d4f3f', marginTop: 14 }}>
            {t('paymentSecureNote')}
          </p>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, padding: '12px 14px', background: '#ecdfc6', borderRadius: 12, fontSize: 12, color: '#3d4a2a', lineHeight: 1.5 }}>
            {t('paymentGuarantee')}
          </div>
        </section>
      </div>
    </>
  )
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentContent />
    </Suspense>
  )
}
