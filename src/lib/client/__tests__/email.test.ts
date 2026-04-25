import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'resend-123' }, error: null }),
      },
    }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

import { sendReportEmail } from '../email'

describe('sendReportEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    process.env.CLIENT_APP_BASE_URL = 'https://example.com'
  })

  it('returns ok: true on successful send', async () => {
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_19_90',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('resend-123')
  })

  it('returns ok: false when env vars are missing', async () => {
    delete process.env.RESEND_API_KEY
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'basic_12',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('email_not_configured')
  })
})
