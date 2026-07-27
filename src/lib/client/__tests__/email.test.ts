import { describe, it, expect, vi, beforeEach } from 'vitest'

function chain(finalResult: any, filters?: Array<{ column: string; value: unknown }>): any {
  const c: any = {
    eq: (column: string, value: unknown) => {
      filters?.push({ column, value })
      return c
    },
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

let insertResult: any = { data: { id: 'log-1' }, error: null }
let existingRowResult: any = { data: null, error: null }
let reclaimResult: any = { data: { id: 'log-1' }, error: null }
const updatePayloads: any[] = []
// Every update(), paired with the WHERE clause it was issued with. The WHERE clause is the
// compare-and-swap and the row identity — `.eq('status', existing.status)` is the only
// thing stopping two concurrent senders from both claiming the same log row, and
// `.eq('id', claimId)` is the only thing aiming the final verdict at the row we claimed.
// An `eq` that records nothing makes both invisible.
type UpdateCall = { payload: any; filters: Array<{ column: string; value: unknown }> }
const updateCalls: UpdateCall[] = []
const whereOf = (call: UpdateCall) =>
  Object.fromEntries(call.filters.map((f) => [f.column, f.value]))
const sendMock = vi.fn().mockResolvedValue({ data: { id: 'resend-123' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return { emails: { send: (...args: unknown[]) => sendMock(...args) } }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => chain(insertResult),
      select: () => chain(existingRowResult),
      update: (payload: any) => {
        updatePayloads.push(payload)
        const filters: Array<{ column: string; value: unknown }> = []
        updateCalls.push({ payload, filters })
        // The re-claim CAS is the only update that consults `reclaimResult`; the final
        // status write is fire-and-forget and never reads its own result.
        return chain(reclaimResult, filters)
      },
    }),
  }),
}))

import { sendReportEmail } from '../email'

describe('sendReportEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    insertResult = { data: { id: 'log-1' }, error: null }
    existingRowResult = { data: null, error: null }
    reclaimResult = { data: { id: 'log-1' }, error: null }
    updatePayloads.length = 0
    updateCalls.length = 0
    sendMock.mockClear()
    sendMock.mockResolvedValue({ data: { id: 'resend-123' }, error: null })
  })

  it('returns ok: true on successful send', async () => {
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('resend-123')
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('returns ok: false when env vars are missing', async () => {
    delete process.env.RESEND_API_KEY
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'basic_1990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('email_not_configured')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('REGRESSION (2026-07-27): re-sends when the client asks again after a successful send', async () => {
    // The "email me my report" button is a request for a new send, not a question about
    // history. Refusing forever because a copy went out once — while telling the client it
    // was sent — is the same lie in a different shape. Reported live: the client pressed it
    // after receiving the automatic email and nothing ever arrived.
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: { id: 'log-1', status: 'sent' }, error: null }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('does not send twice when another attempt is currently "pending" (in flight), and does not claim it was sent', async () => {
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: { id: 'log-1', status: 'pending' }, error: null }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    // Not sending twice is correct. Reporting success is not: nothing has been
    // delivered yet, and the caller renders ok:true as "Report sent to your email".
    expect(sendMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('send_in_progress')
  })

  it('REGRESSION (2026-07-26): a database error while checking the log is never reported as a successful send', async () => {
    // The claim insert failed and the follow-up lookup also failed — Supabase down, or a
    // transient network error. The old code read `!existing` as "already sent" and returned
    // ok:true, so an outage was shown to the client as "Report sent to your email".
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: null, error: { message: 'connection terminated unexpectedly' } }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(sendMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('send_state_unknown')
  })

  it('REGRESSION (2026-07-26): losing the re-claim race is reported as in progress, not as sent', async () => {
    // The row was 'failed' when read, so a retry is legitimate — but between the read and
    // the compare-and-swap another caller re-claimed it, so the update matches nothing.
    // Backing off is right; claiming the email went out is not.
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: { id: 'log-1', status: 'failed' }, error: null }
    reclaimResult = { data: null, error: null }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(sendMock).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error).toBe('send_in_progress')
  })

  it('REGRESSION (2026-07-27): stores why the send failed, in readable form, not "[object Object]"', async () => {
    // Resend returns an error OBJECT. String(err) on it produced literally
    // "[object Object]", which is what landed in the Vercel logs on 2026-07-26 — so even
    // with full logs the 21-day email outage could not be diagnosed. Logs expire; the
    // reason has to live in the database next to the failure.
    sendMock.mockResolvedValue({
      data: null,
      error: { statusCode: 403, name: 'validation_error', message: 'The domain is not verified.' },
    })

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('domain is not verified')
    expect(result.error).not.toContain('[object Object]')

    const fallo = updatePayloads.find((p) => p.status === 'failed')
    expect(fallo).toBeDefined()
    expect(fallo.error_message).toContain('domain is not verified')
  })

  it('clears any previous error_message on a successful send', async () => {
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(result.ok).toBe(true)
    const ok = updatePayloads.find((p) => p.status === 'sent')
    expect(ok.error_message).toBeNull()
  })
})

// Everything above asserts WHAT was written. These assert WHICH ROW it was written to and
// WHAT PRECONDITION was asserted — the WHERE clause. Both are load-bearing: the re-claim's
// `.eq('status', existing.status)` is the entire defence against two callers sending the
// same report twice, and the final `.eq('id', claimId)` is what stops the verdict landing
// on a different client's log row.
describe('sendReportEmail — the compare-and-swap and the row it targets', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    insertResult = { data: { id: 'log-1' }, error: null }
    existingRowResult = { data: null, error: null }
    reclaimResult = { data: { id: 'log-1' }, error: null }
    updatePayloads.length = 0
    updateCalls.length = 0
    sendMock.mockClear()
    sendMock.mockResolvedValue({ data: { id: 'resend-123' }, error: null })
  })

  const send = () =>
    sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

  it('re-claims a FAILED row with a CAS on exactly the status it read, not a hardcoded "sent"', async () => {
    // The status is deliberately 'failed', so a guard hardcoded to 'sent' would write a
    // WHERE that can never match — the re-claim would silently fail against a real
    // database and the client's retry would be reported as "in progress" forever.
    insertResult = { data: null, error: { message: 'duplicate key' } }
    existingRowResult = { data: { id: 'log-77', status: 'failed' }, error: null }
    reclaimResult = { data: { id: 'log-77' }, error: null }

    await send()

    expect(whereOf(updateCalls[0])).toEqual({ id: 'log-77', status: 'failed' })
  })

  it('re-claims a SENT row with a CAS on "sent" — the guard follows what was read, it is not a constant', async () => {
    // Paired with the 'failed' case above: together they pin the guard to `existing.status`
    // rather than to any one literal. Dropping the clause entirely fails both.
    insertResult = { data: null, error: { message: 'duplicate key' } }
    existingRowResult = { data: { id: 'log-88', status: 'sent' }, error: null }
    reclaimResult = { data: { id: 'log-88' }, error: null }

    await send()

    expect(whereOf(updateCalls[0])).toEqual({ id: 'log-88', status: 'sent' })
  })

  it('writes the delivery verdict to the row it actually claimed, not to the analysis or the row it merely read', async () => {
    // The re-claim returns a DIFFERENT id from both the log row first looked up and the
    // analysis id, so `.eq('id', claimId)` is the only expression that produces it. A
    // verdict written to the wrong id marks someone else's send 'sent'.
    insertResult = { data: null, error: { message: 'duplicate key' } }
    existingRowResult = { data: { id: 'log-old', status: 'failed' }, error: null }
    reclaimResult = { data: { id: 'log-claimed-99' }, error: null }

    const result = await send()
    expect(result.ok).toBe(true)

    const verdict = updateCalls.find((c) => c.payload.status === 'sent')
    expect(verdict).toBeDefined()
    expect(whereOf(verdict!)).toEqual({ id: 'log-claimed-99' })
  })

  it('writes a FAILED verdict to the claimed row too, with the same id guard', async () => {
    insertResult = { data: { id: 'log-fresh-5' }, error: null }
    sendMock.mockResolvedValue({
      data: null,
      error: { statusCode: 403, name: 'validation_error', message: 'The domain is not verified.' },
    })

    await send()

    const verdict = updateCalls.find((c) => c.payload.status === 'failed')
    expect(verdict).toBeDefined()
    expect(whereOf(verdict!)).toEqual({ id: 'log-fresh-5' })
  })
})
