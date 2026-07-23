import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let selectResult: { data: unknown; error: unknown } = { data: null, error: null }
const selectMock = vi.fn()

const fromMock = vi.fn(() => ({
  select: (...args: unknown[]) => {
    selectMock(...args)
    return {
      eq: () => ({
        single: () => Promise.resolve(selectResult),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

const createSessionMock = vi.fn()

vi.mock('@/lib/stripe/server', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: createSessionMock } },
  }),
}))

const VALID_TOKEN = '00000000-0000-4000-8000-000000000000'

function makeRequest(token = VALID_TOKEN) {
  return new NextRequest('http://test.example/api/client/payment/checkout-session', {
    method: 'POST',
    body: JSON.stringify({ report_download_token: token }),
  })
}

beforeEach(() => {
  selectMock.mockClear()
  fromMock.mockClear()
  createSessionMock.mockReset()
  selectResult = { data: null, error: null }
})

describe('POST /api/client/payment/checkout-session', () => {
  it('creates a Checkout Session and returns its url (happy path)', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' },
      error: null,
    }
    createSessionMock.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/test-session')
    expect(createSessionMock).toHaveBeenCalledTimes(1)

    const args = createSessionMock.mock.calls[0][0]
    expect(args.mode).toBe('payment')
    expect(args.metadata).toEqual({ report_download_token: VALID_TOKEN })
    expect(args.line_items[0].price_data.currency).toBe('eur')
    expect(args.line_items[0].price_data.unit_amount).toBe(1990)
    expect(args.payment_method_types).toBeUndefined()
    expect(args.automatic_tax).toBeUndefined()
  })

  it('returns 404 when the token is not found', async () => {
    selectResult = { data: null, error: { message: 'not found' } }

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('token_not_found')
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid token', async () => {
    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest('not-a-uuid'))
    expect(res.status).toBe(400)
  })

  it('passes through idempotently when the row already progressed past payment', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'paid', payment_tier: 'premium_2990' },
      error: null,
    }

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('paid')
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('returns 500 when Stripe session creation fails', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'premium_2990' },
      error: null,
    }
    createSessionMock.mockRejectedValue(new Error('stripe down'))

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('stripe_session_failed')
  })
})
