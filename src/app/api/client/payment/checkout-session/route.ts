import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { getStripeClient } from '@/lib/stripe/server'
import { TIER_PRICING, type PaymentTier } from '@/types/client-analysis'

const TIER_PRODUCT_NAMES: Record<PaymentTier, string> = {
  basic_1990: 'Iridology Reading — Essential',
  premium_2990: 'Iridology Reading — Premium',
}

export async function POST(request: NextRequest) {
  let body: { report_download_token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const token = body.report_download_token
  if (!token || !isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: row, error: loadError } = await supabase
    .from('client_analyses')
    .select('report_download_token, status, payment_tier')
    .eq('report_download_token', token)
    .single()

  if (loadError || !row) {
    return NextResponse.json({ error: 'token_not_found' }, { status: 404 })
  }

  // Already progressed past payment (e.g. back-button replay, or an already-paid
  // row) — same idempotent no-op as the mock endpoint, so a retried click never
  // creates a second Stripe session for a row that's already moved on.
  if (row.status !== 'intake_pending') {
    return NextResponse.json(
      { report_download_token: row.report_download_token, status: row.status },
      { status: 200 },
    )
  }

  const tier = row.payment_tier as PaymentTier
  const pricing = TIER_PRICING[tier]
  const origin = request.nextUrl.origin
  const stripe = getStripeClient()

  let session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'auto',
      client_reference_id: token,
      metadata: { report_download_token: token },
      line_items: [
        {
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: Math.round(pricing.amount * 100),
            product_data: { name: TIER_PRODUCT_NAMES[tier] },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/client/upload?token=${token}`,
      cancel_url: `${origin}/client/intake/payment?token=${token}&tier=${tier}`,
    })
  } catch (err) {
    console.error('[stripe] checkout session creation failed:', err)
    return NextResponse.json({ error: 'stripe_session_failed' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url }, { status: 200 })
}
