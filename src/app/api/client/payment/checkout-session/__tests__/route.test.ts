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
const listPromotionCodesMock = vi.fn()

vi.mock('@/lib/stripe/server', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: createSessionMock } },
    promotionCodes: { list: listPromotionCodesMock },
  }),
}))

const VALID_TOKEN = '00000000-0000-4000-8000-000000000000'

function makeRequest(token = VALID_TOKEN, discountCode?: string) {
  return new NextRequest('http://test.example/api/client/payment/checkout-session', {
    method: 'POST',
    body: JSON.stringify({ report_download_token: token, ...(discountCode ? { discount_code: discountCode } : {}) }),
  })
}

beforeEach(() => {
  selectMock.mockClear()
  fromMock.mockClear()
  createSessionMock.mockReset()
  listPromotionCodesMock.mockReset()
  listPromotionCodesMock.mockResolvedValue({ data: [] })
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

  it('states the outcome and destination on the happy path too, so both 200 shapes are self-describing', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' },
      error: null,
    }
    createSessionMock.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(json.outcome).toBe('checkout_session')
    expect(json.redirect_to).toBe('https://checkout.stripe.com/test-session')
    expect(json.url).toBe('https://checkout.stripe.com/test-session')
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

  // The bare {report_download_token, status} shape made "already paid" look
  // identical to "no url came back" from the page's point of view, which is how
  // a successful purchase got rendered as "Algo salió mal" during a live demo.
  // The destination is now stated by the server instead of inferred from a
  // missing field.
  it('REGRESSION (2026-07-26 live-demo incident): an already-paid row returns an explicit forward destination, not just a bare status', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'paid', payment_tier: 'premium_2990' },
      error: null,
    }

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.outcome).toBe('already_paid')
    expect(json.redirect_to).toBe(`/client/upload?token=${VALID_TOKEN}`)
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('applies a valid Stripe promotion code as a discount on the session', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' },
      error: null,
    }
    listPromotionCodesMock.mockResolvedValue({ data: [{ id: 'promo_123', code: 'TESTLIVE1EUR' }] })
    createSessionMock.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest(VALID_TOKEN, 'TESTLIVE1EUR'))

    expect(res.status).toBe(200)
    expect(listPromotionCodesMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TESTLIVE1EUR', active: true }),
    )
    const args = createSessionMock.mock.calls[0][0]
    expect(args.discounts).toEqual([{ promotion_code: 'promo_123' }])
  })

  // Never trust the client's earlier "valid" check from the discount-code
  // endpoint — re-validate against Stripe here too, since the code could have
  // expired or been exhausted in between the two requests.
  it('rejects an expired or unknown discount code instead of silently charging full price', async () => {
    selectResult = {
      data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' },
      error: null,
    }
    listPromotionCodesMock.mockResolvedValue({ data: [] })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    const res = await POST(makeRequest(VALID_TOKEN, 'NOLONGERVALID'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_discount_code')
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

describe('double-charge protection', () => {
  it('sends Stripe an idempotency key so a back-button or second tab cannot mint a second session', async () => {
    // The DB side of payment is compare-and-swap safe, but the *charge* was not: nothing
    // stopped two rapid clicks creating two Checkout Sessions for the same order, which is
    // two real receipts. A stable key per (token, discount) makes Stripe return the first
    // session instead of creating another.
    selectResult = { data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' }, error: null }
    createSessionMock.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/abc' })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    await POST(makeRequest())

    const options = createSessionMock.mock.calls[0][1]
    expect(options?.idempotencyKey).toBeTruthy()
    expect(options.idempotencyKey).toContain(VALID_TOKEN)
  })

  it('uses a different key when a discount is applied, so changing the code still creates the right session', async () => {
    selectResult = { data: { report_download_token: VALID_TOKEN, status: 'intake_pending', payment_tier: 'basic_1990' }, error: null }
    createSessionMock.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/abc' })
    listPromotionCodesMock.mockResolvedValue({ data: [{ id: 'promo_1' }] })

    const { POST } = await import('@/app/api/client/payment/checkout-session/route')
    await POST(makeRequest())
    const sinDescuento = createSessionMock.mock.calls[0][1].idempotencyKey

    createSessionMock.mockClear()
    await POST(makeRequest(VALID_TOKEN, 'TESTCLIENT'))
    const conDescuento = createSessionMock.mock.calls[0][1].idempotencyKey

    expect(conDescuento).not.toBe(sinDescuento)
  })
})
