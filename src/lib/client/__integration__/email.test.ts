import { describe, it, expect, beforeEach, vi } from 'vitest'
import { seedAnalysis, resetDb, readEmailLog, testDb } from '@/test/integration-factories'

// `resend` is the money boundary — the only mock in this file. The UNIQUE(analysis_id)
// constraint on email_send_log, which is the entire concurrency guard in sendReportEmail,
// is real here for the first time: the repo's mocked email tests had no constraint at all,
// so the "claim before sending" design was never actually exercised.
const { resendSend } = vi.hoisted(() => ({
  // Both halves are nullable, because that is what Resend actually returns: `{data, error:
  // null}` on success and `{data: null, error: {...}}` on failure. Typing `data` as always
  // present made the failure case — the one that matters here, since 21 days of silent
  // failures is why these tests exist — a type error.
  resendSend: vi.fn(
    async (): Promise<{ data: { id: string } | null; error: unknown }> => ({
      data: { id: 'resend-id' },
      error: null,
    }),
  ),
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSend }
  },
}))

import { sendReportEmail } from '@/lib/client/email'

// sendReportEmail early-returns 'email_not_configured' without these, so the code under test
// would never run. The value is deliberately a fake: the `resend` module above is mocked, so
// nothing can reach the network with it. .env.test still carries NO real RESEND_API_KEY, and
// integration-setup.ts refuses to start if a real one is exported into the environment.
process.env.RESEND_API_KEY = 're_INTEGRATION_TEST_FAKE_KEY'
process.env.RESEND_FROM_EMAIL = 'reports@integration.test'

const PDF = Buffer.from('%PDF-1.4 integration test')

function callSend(analysisId: string) {
  return sendReportEmail({
    to: 'client@example.com',
    lang: 'es',
    analysisId,
    paymentTier: 'basic_1990',
    pdfBuffer: PDF,
  })
}

beforeEach(async () => {
  await resetDb()
  resendSend.mockReset()
  resendSend.mockResolvedValue({ data: { id: 'resend-id' }, error: null })
})

describe('sendReportEmail against a real Postgres', () => {
  it('sends once and records the send', async () => {
    const analysis = await seedAnalysis({ status: 'completed' })

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(true)
    expect(resendSend).toHaveBeenCalledTimes(1)
    const log = await readEmailLog(analysis.id)
    expect(log?.status).toBe('sent')
    expect(log?.error_message).toBeNull()
  })

  it('THE ONE THE MOCK NEVER HAD: two concurrent sends produce exactly one Resend call', async () => {
    // The real UNIQUE(analysis_id) constraint does the work. The loser's INSERT violates it,
    // it falls through to the lookup, finds the winner's row still 'pending', and backs off
    // with send_in_progress — the honest answer, because the other caller IS still sending.
    //
    // Hold the winner inside Resend long enough that the loser observes 'pending' rather
    // than a finished 'sent'. That is the exact real-world shape: a double-click on
    // "Email me", or the automatic post-analysis send racing a manual resend, while an
    // actual SMTP round-trip is in flight.
    const analysis = await seedAnalysis({ status: 'completed' })
    resendSend.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 400))
      return { data: { id: 'resend-id' }, error: null }
    })

    const [a, b] = await Promise.all([callSend(analysis.id), callSend(analysis.id)])

    expect(resendSend).toHaveBeenCalledTimes(1)

    const winners = [a, b].filter((r) => r.ok)
    const losers = [a, b].filter((r) => !r.ok)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0].error).toBe('send_in_progress')

    expect((await readEmailLog(analysis.id))?.status).toBe('sent')
  })

  it('refuses — and never reports success — while another send holds the pending claim', async () => {
    // "Not knowing is not the same as having sent it." A pending row means someone else is
    // mid-send; answering ok:true here is what once told a client "Report sent to your
    // email" for an email that was never attempted.
    const analysis = await seedAnalysis({ status: 'completed' })
    await testDb().from('email_send_log').insert({
      analysis_id: analysis.id,
      recipient_email: 'client@example.com',
      payment_tier: 'basic_1990',
      status: 'pending',
    })

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('send_in_progress')
    expect(resendSend).not.toHaveBeenCalled()
    expect((await readEmailLog(analysis.id))?.status).toBe('pending')
  })

  it('writes a READABLE failure reason when Resend returns an error object, never "[object Object]"', async () => {
    // Report email delivery failed for 21 straight days and the logs said literally
    // "[object Object]", which made the outage undiagnosable even with full log history.
    // error_message is a column that exists in production and in NO migration file — a
    // schema replayed from docs/migrations/ would not even have it to assert on.
    const analysis = await seedAnalysis({ status: 'completed' })
    resendSend.mockResolvedValue({
      data: null,
      error: { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field' },
    })

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(false)

    const log = await readEmailLog(analysis.id)
    expect(log?.status).toBe('failed')
    expect(typeof log?.error_message).toBe('string')
    expect(log?.error_message.length).toBeGreaterThan(0)
    expect(log?.error_message).not.toBe('[object Object]')
    expect(log?.error_message).toContain('422')
    expect(log?.error_message).toContain('Invalid `to` field')
  })

  it('records a readable reason when the Resend call throws rather than returning an error', async () => {
    const analysis = await seedAnalysis({ status: 'completed' })
    resendSend.mockRejectedValue(new Error('socket hang up'))

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(false)
    const log = await readEmailLog(analysis.id)
    expect(log?.status).toBe('failed')
    expect(log?.error_message).toBe('socket hang up')
  })

  it('re-claims a failed row and sends again', async () => {
    // 'failed' is not terminal: a fresh, deliberate request must be honoured.
    const analysis = await seedAnalysis({ status: 'completed' })
    await testDb().from('email_send_log').insert({
      analysis_id: analysis.id,
      recipient_email: 'client@example.com',
      payment_tier: 'basic_1990',
      status: 'failed',
      error_message: 'an earlier attempt blew up',
    })

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(true)
    expect(resendSend).toHaveBeenCalledTimes(1)
    const log = await readEmailLog(analysis.id)
    expect(log?.status).toBe('sent')
    // The stale reason is cleared, not left to mislead the next reader.
    expect(log?.error_message).toBeNull()
  })

  it('re-sends from a sent row, because "email me my report" must not be a silent no-op', async () => {
    // Reported live on 2026-07-27: the client pressed the button after the automatic email
    // and nothing ever arrived, while the UI still said it worked. Refusing to re-send from
    // 'sent' capped a paying client at one copy for life.
    const analysis = await seedAnalysis({ status: 'completed' })
    await testDb().from('email_send_log').insert({
      analysis_id: analysis.id,
      recipient_email: 'client@example.com',
      payment_tier: 'basic_1990',
      status: 'sent',
    })

    const result = await callSend(analysis.id)

    expect(result.ok).toBe(true)
    expect(resendSend).toHaveBeenCalledTimes(1)
    expect((await readEmailLog(analysis.id))?.status).toBe('sent')
  })
})
