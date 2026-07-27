import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  seedAnalysis,
  resetDb,
  readAnalysis,
  testDb,
  reportContentFixture,
} from '@/test/integration-factories'

// waitUntil is captured, not executed-and-forgotten: the route's real work happens inside it,
// and the test has to be able to await that work before asserting on the database.
const { waitUntilPromises } = vi.hoisted(() => ({ waitUntilPromises: [] as Promise<unknown>[] }))
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromises.push(p)
  },
}))

// The money/AI boundary, and nothing else. The Supabase client, the zod validator, the
// data-URL parser, the language check, the settings lookup in getClientProviders, the
// `reports` insert and every compare-and-swap all run for real.
const { analyzeMock, triggerStage2Mock } = vi.hoisted(() => ({
  analyzeMock: vi.fn(),
  triggerStage2Mock: vi.fn(async () => {}),
}))
vi.mock('@/lib/claude/analyze-dual', () => ({ analyzeIrisDual: analyzeMock }))
vi.mock('@/lib/client/trigger-stage2', () => ({ triggerStage2: triggerStage2Mock }))

import { POST } from '@/app/api/client/upload/route'

function uploadRequest(token: string) {
  return new Request('http://localhost/api/client/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      report_download_token: token,
      right_eye_base64: 'data:image/jpeg;base64,UklGRg==',
      left_eye_base64: 'data:image/png;base64,iVBORw0K',
    }),
  }) as never
}

async function settle() {
  await Promise.all(waitUntilPromises.splice(0))
}

beforeEach(async () => {
  await resetDb()
  waitUntilPromises.length = 0
  analyzeMock.mockReset().mockResolvedValue(reportContentFixture())
  triggerStage2Mock.mockClear()
})

describe('POST /api/client/upload against a real Postgres', () => {
  // One case per value in the real CHECK constraint on client_analyses.status. The DB is the
  // authority on how many there are, so the constraint itself is asserted first: if
  // production ever grows a seventh status, that test fails and this matrix is knowably
  // incomplete instead of silently so.
  it('the status CHECK constraint still admits exactly the six statuses this matrix covers', async () => {
    const rejected = await testDb()
      .from('client_analyses')
      .insert({
        payment_tier: 'basic_1990',
        amount: 19.9,
        report_download_token: crypto.randomUUID(),
        status: 'a_seventh_status',
      })
      .select('id')
    expect(rejected.error).toBeTruthy()
    expect(rejected.error!.message).toMatch(/client_analyses_status_check|violates check constraint/)

    // ...and all six real ones insert cleanly.
    for (const status of [
      'intake_pending',
      'paid',
      'analyzing',
      'stage2_processing',
      'completed',
      'failed',
    ]) {
      const row = await seedAnalysis({ status })
      expect(row.status).toBe(status)
    }
  })

  it('answers 402 payment_required for an unpaid (intake_pending) row', async () => {
    const row = await seedAnalysis({ status: 'intake_pending' })
    const res = await POST(uploadRequest(row.report_download_token))
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: 'payment_required' })
    expect(analyzeMock).not.toHaveBeenCalled()
    // The row is untouched — no claim was made.
    expect((await readAnalysis(row.report_download_token)).analyzing_started_at).toBeNull()
  })

  it('answers 200 and actually starts the analysis for a paid row', async () => {
    const row = await seedAnalysis({ status: 'paid', language: 'en' })
    const res = await POST(uploadRequest(row.report_download_token))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ report_download_token: row.report_download_token })

    // The claim landed before the response was returned.
    const claimed = await readAnalysis(row.report_download_token)
    expect(claimed.analyzing_started_at).not.toBeNull()

    await settle()

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('stage2_processing')
    expect(after.report_id).not.toBeNull()
    expect(after.stage2_started_at).not.toBeNull()
    expect(triggerStage2Mock).toHaveBeenCalledWith(row.report_download_token)

    // The real `reports` insert went through with session_id NULL. docs/schema.sql declares
    // that column NOT NULL; production has it nullable. Had this local schema been replayed
    // from that file, this line would fail for a reason production does not have.
    const { data: reports } = await testDb().from('reports').select('id, session_id')
    expect(reports).toHaveLength(1)
    expect(reports![0].session_id).toBeNull()
  })

  for (const status of ['analyzing', 'stage2_processing', 'completed', 'failed']) {
    it(`answers 409 already_processing (with the token) for a row in '${status}'`, async () => {
      // A client who lost their page and re-submitted. This is not a payment problem: they
      // must be sent onward to their report, not told "something went wrong".
      const row = await seedAnalysis({ status })
      const res = await POST(uploadRequest(row.report_download_token))

      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({
        error: 'already_processing',
        status,
        report_download_token: row.report_download_token,
      })
      expect(analyzeMock).not.toHaveBeenCalled()
    })
  }

  it('answers 404 for a token that does not exist', async () => {
    const res = await POST(uploadRequest(crypto.randomUUID()))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'analysis_not_found' })
  })

  it('TWO CONCURRENT POSTS on a paid row: exactly one 200, one 409, and one analysis run', async () => {
    // The guard is `.eq('status', 'paid')` in the claim UPDATE's WHERE. Real row locking is
    // what makes the second UPDATE match zero rows; a mock `.eq()` that discards its
    // arguments lets both callers claim, and the duplicated analysis — a full paid
    // dual-provider run, billed twice — is invisible.
    const row = await seedAnalysis({ status: 'paid', language: 'en' })

    const [a, b] = await Promise.all([
      POST(uploadRequest(row.report_download_token)),
      POST(uploadRequest(row.report_download_token)),
    ])

    const codes = [a.status, b.status].sort()
    expect(codes).toEqual([200, 409])

    const loser = a.status === 409 ? a : b
    expect(await loser.json()).toMatchObject({
      error: 'already_processing',
      report_download_token: row.report_download_token,
    })

    await settle()

    // The whole point: the expensive work happened once.
    expect(analyzeMock).toHaveBeenCalledTimes(1)
    expect(triggerStage2Mock).toHaveBeenCalledTimes(1)

    // analyzing_started_at was written by one claimant only — proven by there being exactly
    // one downstream report row, which only a winning claim can create.
    const { data: reports } = await testDb().from('reports').select('id')
    expect(reports).toHaveLength(1)

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('stage2_processing')
    expect(after.analyzing_started_at).not.toBeNull()
  })

  it('marks the row failed, with the raw reason, when the analysis throws', async () => {
    const row = await seedAnalysis({ status: 'paid', language: 'en' })
    analyzeMock.mockRejectedValue(new Error('provider exploded'))

    const res = await POST(uploadRequest(row.report_download_token))
    expect(res.status).toBe(200)
    await settle()

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('failed')
    expect(after.failure_reason).toBe('provider exploded')
    expect(triggerStage2Mock).not.toHaveBeenCalled()
  })

  it('rejects a malformed payload before touching the database', async () => {
    const res = await POST(
      new Request('http://localhost/api/client/upload', {
        method: 'POST',
        body: JSON.stringify({ report_download_token: 'not-a-uuid' }),
      }) as never,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_payload')
  })
})
