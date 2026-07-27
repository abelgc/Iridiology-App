import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let updateResult: { data: unknown; error: unknown } = { data: [{ status: 'paid' }], error: null }
const updateMock = vi.fn()

// Every update(), paired with the WHERE clause it was issued with. `.eq('status',
// 'intake_pending')` IS the compare-and-swap — the only thing that makes a retried Stripe
// delivery an idempotent no-op instead of re-stamping paid_at over an in-flight analysis.
// Recording it is what makes changing that value fail an assertion.
type UpdateCall = { payload: unknown; filters: Array<{ column: string; value: unknown }> }
let updateCalls: UpdateCall[] = []
const whereOf = (call: UpdateCall) =>
  Object.fromEntries(call.filters.map((f) => [f.column, f.value]))

const fromMock = vi.fn(() => ({
  update: (...args: unknown[]) => {
    updateMock(...args)
    const filters: Array<{ column: string; value: unknown }> = []
    updateCalls.push({ payload: args[0], filters })
    // Any number of .eq() links, not exactly two. The old mock hardcoded two, so DELETING
    // a guard blew up with "update(...).eq(...).select is not a function" — the shape
    // broke before any assertion could speak, and changing a guard's VALUE passed
    // silently. Failures must come from assertions, never from the mock's own rigidity.
    const chain: any = {
      eq: (column: string, value: unknown) => {
        filters.push({ column, value })
        return chain
      },
      select: () => Promise.resolve(updateResult),
    }
    return chain
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

function checkoutCompletedEvent(overrides: Partial<{ metadata: Record<string, string> | null; client_reference_id: string | null; payment_intent: string | null }> = {}) {
  return {
    id: 'evt_test123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test123',
        metadata: overrides.metadata ?? { report_download_token: VALID_TOKEN },
        client_reference_id: overrides.client_reference_id ?? null,
        payment_intent: overrides.payment_intent === undefined ? 'pi_test_abc123' : overrides.payment_intent,
      },
    },
  }
}

beforeEach(() => {
  updateMock.mockClear()
  updateCalls = []
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
    // The foreign event deliberately carries a PERFECTLY VALID token in both the places
    // the route would look. Previously this fixture had `data.object = {}`, so deleting
    // the event-type filter altogether stayed green — the token guard downstream was
    // silently doing the work. Now only the type filter can stop this event, so its
    // removal fails here instead of passing for the wrong reason.
    constructEventMock.mockReturnValue({
      id: 'evt_other',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_foreign',
          metadata: { report_download_token: VALID_TOKEN },
          client_reference_id: VALID_TOKEN,
          payment_intent: 'pi_test_foreign',
        },
      },
    })

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.received).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it.each([
    ['plainly malformed', 'not-a-uuid-at-all'],
    ['a UUID of the wrong version (v1, not v4)', '00000000-0000-1000-8000-000000000000'],
    ['a UUID with an out-of-range variant nibble', '00000000-0000-4000-c000-000000000000'],
    ['almost right, one character too short', '00000000-0000-4000-8000-00000000000'],
    ['a SQL-ish string smuggled into the metadata', "' OR '1'='1"],
  ])('refuses to touch the database when the token is %s', async (_label, badToken) => {
    // isValidReportToken was only ever exercised with `null`, which the `!token` check
    // already stops on its own — so the format check itself was never actually tested.
    // A non-null token that is not a v4 UUID is the case that needs it.
    constructEventMock.mockReturnValue(
      checkoutCompletedEvent({ metadata: { report_download_token: badToken } }),
    )

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
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

describe('payment traceability', () => {
  it('records the Stripe payment intent, so a real charge is distinguishable from an owner-code bypass', async () => {
    // Both the real Stripe path and OWNER_TEST_DISCOUNT_CODE write is_mock_payment=false,
    // and this column was never populated — so nothing in the database could tell a paid
    // customer from a free internal test. That is an accounting gap, not just a forensic one.
    constructEventMock.mockReturnValue(checkoutCompletedEvent())

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    await POST(makeRequest())

    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      status: 'paid',
      stripe_payment_intent_id: 'pi_test_abc123',
    })
  })

  it('marks the row paid ONLY from intake_pending, on exactly the token from the session', async () => {
    // This WHERE clause is the whole idempotency story. Guarding on 'paid' instead would
    // invert it: a retried delivery would re-stamp paid_at and reset failure_reason on a
    // row whose analysis is already running, while the genuine first delivery — which
    // arrives with the row still 'intake_pending' — would match nothing and the customer
    // would never be marked paid at all.
    constructEventMock.mockReturnValue(checkoutCompletedEvent())

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    await POST(makeRequest())

    expect(updateCalls).toHaveLength(1)
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: VALID_TOKEN,
      status: 'intake_pending',
    })
  })

  it('still marks the row paid when Stripe sends no payment intent (a fully discounted order)', async () => {
    // A 100%-off promotion code produces a zero-amount session with no PaymentIntent.
    // Missing traceability must never block delivery of something the client completed.
    constructEventMock.mockReturnValue(checkoutCompletedEvent({ payment_intent: null }))

    const { POST } = await import('@/app/api/client/payment/webhook/route')
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(updateMock.mock.calls[0][0]).toMatchObject({ status: 'paid' })
    expect(updateMock.mock.calls[0][0].stripe_payment_intent_id).toBeNull()
  })
})
