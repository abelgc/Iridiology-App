import { NextRequest, NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/stripe/server'

export async function POST(request: NextRequest) {
  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const code = body.code?.trim()
  if (!code) {
    return NextResponse.json({ valid: false })
  }

  // The owner's private bypass code takes priority and never touches Stripe —
  // it marks the analysis paid directly (see /api/client/payment).
  const secret = process.env.OWNER_TEST_DISCOUNT_CODE
  if (secret && code.toUpperCase() === secret.toUpperCase()) {
    return NextResponse.json({ valid: true, kind: 'owner_free' })
  }

  // Anything else is checked against real Stripe promotion codes, so a
  // genuine discount still creates a real (reduced) Checkout Session.
  try {
    const stripe = getStripeClient()
    const result = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
      expand: ['data.promotion.coupon'],
    })
    const promo = result.data[0]
    const coupon = promo?.promotion.coupon
    if (!promo || !coupon || typeof coupon === 'string') {
      return NextResponse.json({ valid: false })
    }
    return NextResponse.json({
      valid: true,
      kind: 'stripe_promo',
      amountOffCents: coupon.amount_off,
      percentOff: coupon.percent_off,
    })
  } catch (err) {
    console.error('[discount-code] Stripe promotion code lookup failed:', err)
    return NextResponse.json({ valid: false })
  }
}
