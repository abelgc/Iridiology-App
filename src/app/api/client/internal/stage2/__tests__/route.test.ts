import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.INTERNAL_TRIGGER_SECRET = 'test-secret'

let currentRow: any
// Per-call-index override list for every `.update(...)` call made against the shared mock
// (both the `client_analyses` claim/completed/failed writes and the `reports` content
// write go through this same mock, in call order). Missing/undefined entries fall back to
// a truthy "claimed" result.
let updateCallResults: any[] = []
let updateCallIndex = 0

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    is: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => chain({ data: currentRow, error: null }),
      update: () => {
        const result = updateCallResults[updateCallIndex] ?? { data: { status: 'ok' }, error: null }
        updateCallIndex++
        return chain(result)
      },
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

let waitUntilPromise: Promise<unknown> | null = null
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromise = p
  },
}))

const baseRow = {
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
  stage2_started_at: '2026-01-01T00:00:00.000Z',
  reports: { id: 'r1', report_content: { section_1_general_terrain: 'x' } },
}

describe('POST /api/client/internal/stage2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateCallResults = []
    updateCallIndex = 0
    waitUntilPromise = null
    mockRewrite.mockReset().mockResolvedValue({ section_1_general_terrain: 'client x' })
    mockGeneratePdf.mockReset().mockResolvedValue(Buffer.from('PDF_MAGIC_BYTES', 'utf8'))
    mockSendEmail.mockReset().mockResolvedValue({ ok: true })
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

  it('skips and never runs the pipeline when the claim CAS loses the race (stage2_started_at changed)', async () => {
    currentRow = { ...baseRow }
    updateCallResults = [{ data: null, error: null }] // call 0 = the claim, loses
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-1' }),
    }) as any)
    const json = await res.json()
    expect(json.skipped).toBe(true)
    expect(mockRewrite).not.toHaveBeenCalled()
  })

  it('processes stage 2 and sends the PDF as an email attachment, not just a link', async () => {
    currentRow = { ...baseRow }
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-1' }),
    }) as any)
    expect(res.status).toBe(200)

    await waitUntilPromise

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ pdfBuffer: expect.any(Buffer) })
    )
    expect(mockSendEmail.mock.calls[0][0].pdfBuffer.toString('utf8')).toContain('PDF_MAGIC_BYTES')
  })

  it('skips sending email when the success CAS loses the race (superseded by another invocation)', async () => {
    currentRow = { ...baseRow }
    // call 0 = claim (succeeds, default), call 1 = reports content update (succeeds, default,
    // result unchecked), call 2 = the 'completed' write — loses the race.
    updateCallResults = [undefined, undefined, { data: null, error: null }]
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-1' }),
    }) as any)
    expect(res.status).toBe(200)

    await waitUntilPromise

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not throw and treats the failed-write CAS as a no-op when the row already progressed', async () => {
    currentRow = { ...baseRow }
    // call 0 = claim (succeeds, default); rewrite rejects before any further update call,
    // sending control to the catch block, whose guarded 'failed' write is call 1 — simulate
    // it losing the race, as if another invocation had already completed this run.
    mockRewrite.mockRejectedValue(new Error('rewrite boom'))
    updateCallResults = [undefined, { data: null, error: null }]
    const { POST } = await import('../route')
    const res = await POST(new Request('http://test', {
      method: 'POST',
      headers: { 'x-internal-trigger-secret': 'test-secret' },
      body: JSON.stringify({ report_download_token: 'tok-1' }),
    }) as any)
    expect(res.status).toBe(200)

    await expect(waitUntilPromise).resolves.toBeUndefined()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
