'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { useToast } from '@/hooks/use-toast'
import { TIER_PRICING, formatAmountCents, formatTierPrice, type PaymentTier } from '@/types/client-analysis'

type DiscountState = 'idle' | 'checking' | 'applied' | 'error'
type DiscountKind = 'owner_free' | 'stripe_promo' | null

// The server states where an already-paid order should go next, but a
// destination is still untrusted input: only follow a same-origin in-app path,
// so router.push can never become an open redirect. Anything else falls back to
// the upload step for this token.
function forwardPath(redirectTo: unknown, token: string): string {
  const fallback = `/client/upload?token=${token}`
  if (typeof redirectTo !== 'string') return fallback
  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) return fallback
  return redirectTo
}

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
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const tier = searchParams.get('tier') as PaymentTier | null

  const [submitting, setSubmitting] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [discountState, setDiscountState] = useState<DiscountState>('idle')
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountKind, setDiscountKind] = useState<DiscountKind>(null)
  const [discountAmountOffCents, setDiscountAmountOffCents] = useState<number | null>(null)
  const [discountPercentOff, setDiscountPercentOff] = useState<number | null>(null)

  const validTier = tier === 'basic_1990' || tier === 'premium_2990'

  useEffect(() => {
    if (!token || !validTier) {
      router.replace('/client')
    }
  }, [token, validTier, router])

  if (!token || !validTier) return null

  const isPremium = tier === 'premium_2990'
  const hasDiscount = discountState === 'applied' && discountKind !== null
  const tierAmountCents = Math.round(TIER_PRICING[tier as PaymentTier].amount * 100)
  const totalCents = !hasDiscount
    ? tierAmountCents
    : discountKind === 'owner_free'
      ? 0
      : Math.max(
          0,
          discountAmountOffCents != null
            ? tierAmountCents - discountAmountOffCents
            : discountPercentOff != null
              ? Math.round(tierAmountCents * (1 - discountPercentOff / 100))
              : tierAmountCents,
        )
  const isFree = totalCents === 0

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
      const json = (await res.json()) as {
        valid?: boolean
        kind?: 'owner_free' | 'stripe_promo'
        amountOffCents?: number | null
        percentOff?: number | null
      }
      if (res.ok && json.valid) {
        setDiscountState('applied')
        setDiscountKind(json.kind ?? null)
        setDiscountAmountOffCents(json.amountOffCents ?? null)
        setDiscountPercentOff(json.percentOff ?? null)
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
    setDiscountKind(null)
    setDiscountAmountOffCents(null)
    setDiscountPercentOff(null)
  }

  // Every failure below used to raise the same bare t('error'), so six distinct
  // situations were indistinguishable to the customer and to the owner watching
  // over their shoulder. New user-facing sentences would need verified en/es/de
  // copy, so instead each failure carries a short, stable diagnostic code that
  // can be read out over the phone and grepped in the console.
  function failWith(code: string) {
    console.error('[payment] could not start payment:', code)
    setSubmitting(false)
    // This is the box that appeared over a working order during the live demo on
    // 2026-07-26. The cause is fixed; the presentation was not. A native alert
    // freezes the whole page and prints the raw deployment URL above the message,
    // which on a phone reads like a security warning rather than this shop
    // speaking to its customer.
    toast({ description: `${t('error')} (${code})`, variant: 'destructive' })
  }

  async function handleContinue() {
    if (!token) return
    setSubmitting(true)

    try {
      // The owner's private code skips Stripe entirely. Any other applied
      // discount (a real Stripe promotion code) still goes through Checkout,
      // just with the discount attached, so it creates a real transaction.
      if (discountKind === 'owner_free') {
        const res = await fetch('/api/client/payment', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ report_download_token: token, discount_code: discountCode.trim() }),
        })
        if (!res.ok) {
          failWith(`free-order-${res.status}`)
          return
        }
        // Deliberately leave `submitting` true while navigating away, so a
        // second click can't fire a second payment request mid-navigation.
        router.push(`/client/upload?token=${token}`)
        return
      }

      const res = await fetch('/api/client/payment/checkout-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          report_download_token: token,
          ...(discountKind === 'stripe_promo' ? { discount_code: discountCode.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => null)

      // The order is already paid (back-button replay, reload-then-retry). That
      // is a success, not a failure: carry the customer forward instead of
      // showing them an error on a purchase they already completed.
      //
      // `outcome` is the contract. The `status` fallback covers the rolling-
      // deploy window, where this bundle can be talking to a still-warm server
      // instance that only sends the old bare {token, status} shape — the route
      // only ever answers 200-without-a-url for a row that has moved past
      // intake_pending, i.e. one that has been paid for.
      const alreadyPaid =
        res.ok && !json?.url && (json?.outcome === 'already_paid' || typeof json?.status === 'string')
      if (alreadyPaid) {
        router.push(forwardPath(json.redirect_to, token))
        return
      }

      if (!res.ok) {
        failWith(typeof json?.error === 'string' ? json.error : `http-${res.status}`)
        return
      }

      // 200 with neither a checkout URL nor a stated outcome: the server has
      // told us nothing actionable, which is a real failure — but a *different*
      // one from "already paid", and it must never be confused with it again.
      if (!json?.url) {
        failWith('no-destination')
        return
      }

      window.location.href = json.url
    } catch {
      // A dropped connection used to reject with nothing catching it:
      // `submitting` stayed true, the button stayed disabled, and the customer
      // was left staring at a dead page with no message at all.
      failWith('network')
    }
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
            {discountState === 'applied' ? (
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
            {hasDiscount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14, color: '#5a6e3a', marginBottom: 10 }}>
                <span>{t('paymentDiscountRowLabel')}</span>
                <span style={{ fontWeight: 600 }}>−{formatAmountCents(tierAmountCents - totalCents, lang)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #d8c9ad', paddingTop: 14, marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: '#2a3520' }}>{t('paymentTotalDue')}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, color: '#2a3520', letterSpacing: '-0.01em' }}>
                {formatAmountCents(totalCents, lang)}
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
