import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.INTERNAL_TRIGGER_SECRET = 'test-secret'

let currentRow: any
let claimSucceeds = true

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => chain({ data: currentRow, error: null }),
      update: () => chain({ data: claimSucceeds ? { report_download_token: 'tok' } : null, error: null }),
    }),
  }),
}))

const mockShouldJyotish = vi.fn().mockReturnValue(false)
const mockEnhance = vi.fn((...args: unknown[]) => Promise.resolve(args[0]))
const mockRewrite = vi.fn()
const mockGeneratePdf = vi.fn()
const mockSendEmail = vi.fn()

vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: (...args: any[]) => mockShouldJyotish(...args),
  enhanceEmotionalFieldWithJyotish: (...args: any[]) => mockEnhance(...args),
}))
vi.mock('@/lib/client/writing-pipeline', () => ({
  rewriteReportForClient: (...args: any[]) => mockRewrite(...args),
}))
vi.mock('@/lib/client/pdf', () => ({
  generateReportPdf: (...args: any[]) => mockGeneratePdf(...args),
}))
vi.mock('@/lib/client/email', () => ({
  sendReportEmail: (...args: any[]) => mockSendEmail(...args),
}))
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => p,
}))

describe('POST /api/client/internal/stage2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    claimSucceeds = true
  })

  it('rejects requests without a valid internal secret', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      body: JSON.stringify({ report_download_token: 'x' }),
    }) as any)
    expect(res.status).toBe(401)
  })

  it('skips when the row is not in stage2_processing', async () => {
    currentRow = { report_download_token: 'tok-2', status: 'completed' }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-2' }),
    }) as any)
    const json = await res.json()
    expect(json.skipped).toBe(true)
    expect(json.status).toBe('completed')
  })

  it('processes stage 2 and sends the PDF as an email attachment, not just a link', async () => {
    currentRow = {
      report_download_token: 'tok-1',
      status: 'stage2_processing',
      payment_tier: 'premium_19_90',
      language: 'en',
      email: 'client@example.com',
      date_of_birth: null,
      country_of_birth: null,
      city_of_birth: null,
      time_of_day: null,
      report_id: 'r1',
      reports: { id: 'r1', report_content: { section_1_general_terrain: 'x' } },
    }
    mockRewrite.mockResolvedValue({ section_1_general_terrain: 'client x' })
    const pdfBuffer = Buffer.from('PDF_MAGIC_BYTES', 'utf8')
    mockGeneratePdf.mockResolvedValue(pdfBuffer)
    mockSendEmail.mockResolvedValue({ ok: true })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-1' }),
    }) as any)
    expect(res.status).toBe(200)

    // Flush the fire-and-forget background task.
    await new Promise((r) => setTimeout(r, 20))

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ pdfBuffer: expect.any(Buffer) })
    )
    expect(mockSendEmail.mock.calls[0][0].pdfBuffer.toString('utf8')).toContain('PDF_MAGIC_BYTES')
  })
})
