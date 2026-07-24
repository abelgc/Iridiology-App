import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { getStripeClient } from '@/lib/stripe/server'
import type Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 400 })
  }

  const rawBody = await request.text()
  const stripe = getStripeClient()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    // Not an event we act on — acknowledge it so Stripe stops retrying.
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const session = event.data.object as Stripe.Checkout.Session
  const token = session.metadata?.report_download_token ?? session.client_reference_id ?? null

  if (!token || !isValidReportToken(token)) {
    console.error(`[stripe-webhook] checkout.session.completed with no valid report token, session ${session.id}`)
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const supabase = createAdminClient()

  // Same CAS idea as /api/client/payment, /api/client/upload, and
  // /api/client/internal/stage2 — only transitions from 'intake_pending'.
  // Unlike those, this uses a plain array select (not .single()) so a
  // retried delivery for an already-paid row comes back as an empty
  // array with no error (idempotent no-op), distinct from a genuine
  // database failure that should make Stripe retry.
  const { data, error } = await supabase
    .from('client_analyses')
    .update({
      paid_at: new Date().toISOString(),
      is_mock_payment: false,
      status: 'paid',
      failure_reason: null,
    })
    .eq('report_download_token', token)
    .eq('status', 'intake_pending')
    .select('status')

  if (error) {
    console.error(`[stripe-webhook] failed to mark ${token} paid:`, error)
    return NextResponse.json({ error: 'db_update_failed' }, { status: 500 })
  }

  if (!data || data.length === 0) {
    console.log(`[stripe-webhook] token ${token} already progressed past payment — idempotent no-op`)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
