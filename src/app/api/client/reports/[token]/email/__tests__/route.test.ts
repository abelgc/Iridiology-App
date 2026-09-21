import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentRow: any

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
    }),
  }),
}))

const mockGeneratePdf = vi.fn()
const mockSendEmail = vi.fn()
vi.mock('@/lib/client/pdf', () => ({
  generateReportPdf: (...args: unknown[]) => mockGeneratePdf(...args),
}))
vi.mock('@/lib/client/email', () => ({
  sendReportEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

import { POST } from '../route'

const VALID_TOKEN = '11111111-1111-4111-8111-111111111111'

function makeRequest() {
  return new Request(`http://test/api/client/reports/${VALID_TOKEN}/email`, {
    method: 'POST',
  }) as never
}

function callRoute() {
  return POST(makeRequest() as any, { params: Promise.resolve({ token: VALID_TOKEN }) })
}

const baseRow = {
  id: 'analysis-1',
  email: 'client@example.com',
  language: 'en',
  status: 'completed',
  payment_tier: 'premium_2990',
  reports: { client_report_content: { section_1_general_terrain: 'x' }, report_content: null },
}

describe('POST /api/client/reports/[token]/email', () => {
  beforeEach(() => {
    currentRow = { ...baseRow }
    mockGeneratePdf.mockReset().mockResolvedValue(Buffer.from('%PDF-1.7'))
    mockSendEmail.mockReset().mockResolvedValue({ ok: true, id: 'email-1' })
  })

  it('rejects a malformed token before touching the database', async () => {
    const res = await POST(
      new Request('http://test/api/client/reports/not-a-uuid/email', { method: 'POST' }) as any,
      { params: Promise.resolve({ token: 'not-a-uuid' }) },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_token')
    expect(mockGeneratePdf).not.toHaveBeenCalled()
  })

  it('returns 404 when no row matches the token', async () => {
    currentRow = null
    const res = await callRoute()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })

  it("returns 409 when the analysis isn't completed yet", async () => {
    currentRow = { ...baseRow, status: 'stage2_processing' }
    const res = await callRoute()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('not_ready')
  })

  it('returns 410 when the client has no email on file', async () => {
    currentRow = { ...baseRow, email: null }
    const res = await callRoute()
    expect(res.status).toBe(410)
    expect((await res.json()).error).toBe('email_unavailable')
  })

  it('returns 404 when neither client_report_content nor report_content exists', async () => {
    currentRow = { ...baseRow, reports: { client_report_content: null, report_content: null } }
    const res = await callRoute()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('report_not_found')
  })

  it('prefers client_report_content over report_content when generating the PDF', async () => {
    currentRow = {
      ...baseRow,
      reports: {
        client_report_content: { section_1_general_terrain: 'client voice' },
        report_content: { section_1_general_terrain: 'practitioner voice' },
      },
    }
    await callRoute()
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      { section_1_general_terrain: 'client voice' },
      'en',
      true,
    )
  })

  it('falls back to report_content when client_report_content is missing', async () => {
    currentRow = {
      ...baseRow,
      reports: { client_report_content: null, report_content: { section_1_general_terrain: 'practitioner voice' } },
    }
    await callRoute()
    expect(mockGeneratePdf).toHaveBeenCalledWith(
      { section_1_general_terrain: 'practitioner voice' },
      'en',
      true,
    )
  })

  it('sends the generated PDF to the email on file and reports success', async () => {
    const pdf = Buffer.from('%PDF-fake')
    mockGeneratePdf.mockResolvedValue(pdf)
    const res = await callRoute()
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      lang: 'en',
      analysisId: 'analysis-1',
      paymentTier: 'premium_2990',
      pdfBuffer: pdf,
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: 'email-1' })
  })

  it('surfaces a 502 with the failure detail when sendReportEmail fails, instead of a false 200', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, error: 'resend_rejected' })
    const res = await callRoute()
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'email_failed', detail: 'resend_rejected' })
  })

  it('passes isPremium=false for the basic tier, so the PDF omits premium-only content', async () => {
    currentRow = { ...baseRow, payment_tier: 'basic_1990' }
    await callRoute()
    expect(mockGeneratePdf).toHaveBeenCalledWith(expect.anything(), 'en', false)
  })
})
