import { describe, it, expect, vi, beforeEach } from 'vitest'

let waitUntilPromise: Promise<unknown> | null = null
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromise = p
  },
}))

const analysisRow = {
  id: 'a1',
  status: 'paid',
  language: 'es',
  payment_tier: 'basic_1990',
  email: 'jane@example.com',
  date_of_birth: '1990-05-12',
  country_of_birth: 'Mexico',
  city_of_birth: 'Mexico City',
  time_of_day: 'morning',
  main_complaint: 'Fatigue',
  symptom_duration: '6 months',
  current_medications: '',
  report_download_token: '00000000-0000-4000-8000-000000000000',
}

const mockReport = {
  section_1_general_terrain: 'g',
  section_2_emotional_field: 'e',
  section_3_cognitive_nervous: 'n',
  section_4_immune_lymphatic: 'i',
  section_5_endocrine_hormonal: 'h',
  section_6_circulatory_cardiorespiratory: 'c',
  section_7_hepatic: 'l',
  section_8_digestive_intestinal: 'd',
  section_9_renal_urinary: 'r',
  section_10_structural_integumentary: 's',
  section_11_detected_axes: 'a',
  section_12_conclusion: 'C',
  section_13_strengths_of_the_body: 'S',
}

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

const selectSingle = vi.fn().mockResolvedValue({ data: analysisRow, error: null })
const updateMock = vi.fn()
// Per-call-index override list for the `client_analyses` update chain. Missing/undefined
// entries fall back to a truthy "claimed" result. Lets tests simulate a specific update in
// the sequence losing its CAS (0 rows) without affecting the others.
let updateCallResults: any[] = []
let updateCallIndex = 0
const insertReport = vi.fn().mockResolvedValue({
  data: { id: 'r1' },
  error: null,
})

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'client_analyses') {
        return {
          select: () => ({
            eq: () => ({ single: selectSingle }),
          }),
          update: (...args: unknown[]) => {
            updateMock(...args)
            const result = updateCallResults[updateCallIndex] ?? {
              data: { report_download_token: analysisRow.report_download_token },
              error: null,
            }
            updateCallIndex++
            return chain(result)
          },
        }
      }
      if (table === 'reports') {
        return {
          insert: () => ({ select: () => ({ single: insertReport }) }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

const mockAnalyzeDual = vi.fn().mockResolvedValue(mockReport)
vi.mock('@/lib/claude/analyze-dual', () => ({
  analyzeIrisDual: (...args: unknown[]) => mockAnalyzeDual(...args),
}))

vi.mock('@/lib/ai/get-provider', () => ({
  getClientProviders: vi.fn().mockResolvedValue({
    anthropic: {},
    openai: {},
  }),
}))

vi.mock('@/app/api/client/upload/language-check', () => ({
  detectsCorrectLanguage: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: () => false,
  enhanceEmotionalFieldWithJyotish: vi.fn(async (r: unknown) => r),
}))

const mockTriggerStage2 = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/client/trigger-stage2', () => ({
  triggerStage2: (...args: unknown[]) => mockTriggerStage2(...args),
}))

beforeEach(() => {
  waitUntilPromise = null
  selectSingle.mockClear()
  selectSingle.mockResolvedValue({ data: analysisRow, error: null })
  updateMock.mockClear()
  updateCallResults = []
  updateCallIndex = 0
  insertReport.mockClear()
  mockAnalyzeDual.mockReset().mockResolvedValue(mockReport)
  mockTriggerStage2.mockClear()
})

function makeRequest(overrides?: { right_eye_base64?: string; left_eye_base64?: string }) {
  return new Request('http://test/api/client/upload', {
    method: 'POST',
    body: JSON.stringify({
      report_download_token: '00000000-0000-4000-8000-000000000000',
      right_eye_base64: overrides?.right_eye_base64 ?? 'data:image/jpeg;base64,AAA',
      left_eye_base64: overrides?.left_eye_base64 ?? 'data:image/jpeg;base64,BBB',
    }),
  }) as never
}

describe('POST /api/client/upload', () => {
  it('runs analysis, stores report, and returns the token', async () => {
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report_download_token).toBe('00000000-0000-4000-8000-000000000000')
    await waitUntilPromise
    expect(insertReport).toHaveBeenCalledTimes(1)
    expect(mockTriggerStage2).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000')
  })

  it('parses each eye image data URL independently and passes the real declared media type through, not a hardcoded image/jpeg', async () => {
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(
      makeRequest({
        right_eye_base64: 'data:image/png;base64,RIGHTPNG',
        left_eye_base64: 'data:image/jpeg;base64,LEFTJPEG',
      }),
    )
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(mockAnalyzeDual).toHaveBeenCalledTimes(1)
    const [analysisRequest] = mockAnalyzeDual.mock.calls[0]
    expect(analysisRequest.rightIrisBase64).toBe('RIGHTPNG')
    expect(analysisRequest.rightIrisMediaType).toBe('image/png')
    expect(analysisRequest.leftIrisBase64).toBe('LEFTJPEG')
    expect(analysisRequest.leftIrisMediaType).toBe('image/jpeg')
  })

  it('refuses unpaid analyses', async () => {
    selectSingle.mockResolvedValueOnce({
      data: { ...analysisRow, status: 'intake_pending' },
      error: null,
    })
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(402)
  })

  it('returns 409 and never runs the analysis when the initial "analyzing" CAS finds 0 rows', async () => {
    // Simulates a duplicate/retried POST for the same token — the very first update
    // (paid -> analyzing) loses its CAS because another request already claimed it.
    updateCallResults = [{ data: null, error: null }]
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toBe('already_processing')
    expect(mockAnalyzeDual).not.toHaveBeenCalled()
  })

  it('does not throw and treats the failed-write CAS as a no-op when the row already progressed', async () => {
    // Call 0 = the initial 'paid' -> 'analyzing' claim (succeeds, default).
    // analyzeIrisDual throws, sending control straight to the catch block, whose guarded
    // 'failed' write is call 1 — simulate it losing the race (0 rows), as if the row had
    // already moved on (e.g. to 'stage2_processing') by the time this write landed.
    updateCallResults = [undefined, { data: null, error: null }]
    mockAnalyzeDual.mockRejectedValue(new Error('boom'))
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await expect(waitUntilPromise).resolves.toBeUndefined()
    const failedCall = updateMock.mock.calls.find(([arg]) => arg.status === 'failed')
    expect(failedCall).toBeTruthy()
  })

  it('tags failure_reason with billing_or_auth_error when analyzeIrisDual fails with a non-retryable 400 invalid_request_error', async () => {
    updateCallResults = [undefined, { data: null, error: null }]
    const billingError = Object.assign(
      new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'),
      { status: 400, error: { type: 'error', error: { type: 'invalid_request_error' } } },
    )
    mockAnalyzeDual.mockRejectedValue(billingError)
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await expect(waitUntilPromise).resolves.toBeUndefined()

    const failedCall = updateMock.mock.calls.find(([arg]) => arg.status === 'failed')
    expect(failedCall).toBeTruthy()
    expect(failedCall![0].failure_reason).toMatch(/^billing_or_auth_error: /)
    expect(failedCall![0].failure_reason).toContain('credit balance is too low')
  })

  it('does not tag failure_reason for a genuinely transient error (message unchanged)', async () => {
    updateCallResults = [undefined, { data: null, error: null }]
    mockAnalyzeDual.mockRejectedValue(new Error('boom'))
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await expect(waitUntilPromise).resolves.toBeUndefined()

    const failedCall = updateMock.mock.calls.find(([arg]) => arg.status === 'failed')
    expect(failedCall).toBeTruthy()
    expect(failedCall![0].failure_reason).toBe('boom')
  })

  it('rescues a late-arriving success when the 270s timeout guard already marked the row failed', async () => {
    // Call 0 = the initial 'paid' -> 'analyzing' claim (succeeds, default).
    // Call 1 = the 'analyzing' -> 'stage2_processing' claim loses its CAS (0 rows) —
    // simulates the withTimeout guard having already written 'failed' first.
    // Call 2 = the new rescue attempt, guarded on 'failed' specifically, succeeds (default).
    updateCallResults = [undefined, { data: null, error: null }]
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    // The report was still inserted (analysis genuinely succeeded)...
    expect(insertReport).toHaveBeenCalledTimes(1)
    // ...and stage 2 was still triggered — proving the late result was rescued,
    // not discarded, despite the first CAS losing the race.
    expect(mockTriggerStage2).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000')

    // The rescue update (3rd .update() call on client_analyses) clears failure_reason
    // and re-asserts stage2_processing — confirms the rescue path ran, not just the
    // normal path succeeding on a lucky retry.
    expect(updateMock).toHaveBeenCalledTimes(3)
    const rescueCallArgs = updateMock.mock.calls[2][0]
    expect(rescueCallArgs).toMatchObject({ status: 'stage2_processing', failure_reason: null })
  })

  it('discards the result when both the normal claim and the rescue attempt lose their CAS', async () => {
    // Call 1 (normal claim) and call 2 (rescue attempt) both find 0 matching rows —
    // simulates the row having moved to some other, unrecognized status in between.
    updateCallResults = [undefined, { data: null, error: null }, { data: null, error: null }]
    const { POST } = await import('@/app/api/client/upload/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(insertReport).toHaveBeenCalledTimes(1)
    expect(mockTriggerStage2).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledTimes(3)
  })
})
