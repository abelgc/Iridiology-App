import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn(function () {
    return {
      emails: { send: sendMock },
    }
  }),
}))

beforeEach(() => {
  sendMock.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'Test <test@test.com>'
  process.env.CLIENT_APP_BASE_URL = 'https://example.com'
})

describe('sendReportEmail', () => {
  it('sends to the provided address with a localized subject (es)', async () => {
    const { sendReportEmail } = await import('@/lib/client/email')
    await sendReportEmail({
      to: 'jane@example.com',
      lang: 'es',
      reportToken: '00000000-0000-4000-8000-000000000000',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('jane@example.com')
    expect(arg.subject).toMatch(/Informe/i)
    expect(arg.html).toContain('https://example.com/client/report/00000000-0000-4000-8000-000000000000')
  })

  it('uses english subject for en', async () => {
    const { sendReportEmail } = await import('@/lib/client/email')
    await sendReportEmail({
      to: 'jane@example.com',
      lang: 'en',
      reportToken: '00000000-0000-4000-8000-000000000000',
    })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.subject).toMatch(/Report/i)
  })
})
