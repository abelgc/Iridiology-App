import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let updateResult: { data: unknown; error: unknown } = { data: [{ status: 'paid' }], error: null }
const updateMock = vi.fn()

const fromMock = vi.fn(() => ({
  update: (...args: unknown[]) => {
    updateMock(...args)
    return {
      eq: () => ({
        eq: () => ({
          select: () => Promise.resolve(updateResult),
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

const constructEventMock = vi.fn()

vi.mock('@/lib/stripe/server', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
  }),
}))

const VALID_TOKEN = '00000000-0000-4000-8000-000000000000'

function makeRequest(body = 'raw-body', signature: string | null = 'sig_test') {
  const headers = new Headers()
  if (signature) headers.set('stripe-signature', signature)
  return new Request('http://test/api/client/payment/webhook', {
    method: 'POST',
    headers,
    body,
  }) as never
}

function checkoutCompletedEvent(overrides: Partial<{ metadata: Record<string, string> | null; client_reference_id: string | null }> = {}) {
  return {
    id: 'evt_test123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test123',
        metadata: overrides.metadata ?? { report_download_token: VALID_TOKEN },
        client_reference_id: overrides.client_reference_id ?? null,
      },
    },
  }
}

beforeEach(() => {
  updateMock.mockClear()
  fromMock.mockClear()
  constructEventMock.mockReset()
  updateResult = { data: [{ status: 'paid' }], error: null }
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
})

afterEach(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET
})

describe('POST /api/client/payment/webhook', () => {
  it('marks the row paid on a valid checkout.session.completed event (happy path)', async () => {
    constructEventMock.mockReturnValue(checkoutCompletedEvent())

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: 'paid', is_mock_payment: false })
  })

  it('reads the token from client_reference_id when metadata is missing', async () => {
    constructEventMock.mockReturnValue(checkoutCompletedEvent({ metadata: null, client_reference_id: VALID_TOKEN }))

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('returns 400 and skips DB work when the signature is invalid', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('invalid signature')
    })

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('invalid_signature')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the stripe-signature header is missing, without calling Stripe', async () => {
    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest('raw-body', null))

    expect(res.status).toBe(400)
    expect(constructEventMock).not.toHaveBeenCalled()
  })

  it('acknowledges but ignores event types other than checkout.session.completed', async () => {
    constructEventMock.mockReturnValue({ id: 'evt_other', type: 'payment_intent.succeeded', data: { object: {} } })

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('acknowledges without crashing when there is no valid report token on the session', async () => {
    constructEventMock.mockReturnValue(checkoutCompletedEvent({ metadata: {}, client_reference_id: null }))

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('treats a duplicate delivery (row already progressed) as a harmless no-op, still 200', async () => {
    constructEventMock.mockReturnValue(checkoutCompletedEvent())
    updateResult = { data: [], error: null }

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
  })

  it('returns 500 on a genuine database failure, so Stripe retries the delivery', async () => {
    constructEventMock.mockReturnValue(checkoutCompletedEvent())
    updateResult = { data: null, error: { message: 'connection reset' } }

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toBe('db_update_failed')
  })
})
