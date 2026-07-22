import { describe, it, expect, vi, beforeEach } from 'vitest'

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

let insertResult: any = { data: { id: 'log-1' }, error: null }
let existingRowResult: any = { data: null, error: null }
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
      update: () => chain({ data: null, error: null }),
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

  it('does not send twice when a log row already exists as "sent" (claim-first dedup)', async () => {
    // Simulate: the claim insert fails (UNIQUE violation — a row already exists), and the
    // follow-up lookup finds it already marked 'sent'.
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: { id: 'log-1', status: 'sent' }, error: null }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('already_sent')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does not send twice when another attempt is currently "pending" (in flight)', async () => {
    insertResult = { data: null, error: { message: 'duplicate key value violates unique constraint' } }
    existingRowResult = { data: { id: 'log-1', status: 'pending' }, error: null }

    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_2990',
      pdfBuffer: Buffer.from('%PDF-test'),
    })

    expect(result.ok).toBe(true)
    expect(result.id).toBe('already_sent')
    expect(sendMock).not.toHaveBeenCalled()
  })
})
