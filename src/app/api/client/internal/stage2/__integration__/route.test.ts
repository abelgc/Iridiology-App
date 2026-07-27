import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  seedAnalysis,
  seedReport,
  resetDb,
  readAnalysis,
  reportContentFixture,
  minutesAgo,
} from '@/test/integration-factories'

const { waitUntilPromises } = vi.hoisted(() => ({ waitUntilPromises: [] as Promise<unknown>[] }))
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromises.push(p)
  },
}))

// The AI boundary. firstNameFrom is a pure helper that happens to live in the same module as
// the expensive one, so it is reimplemented here rather than left undefined.
const { rewriteMock, enhanceMock } = vi.hoisted(() => ({
  rewriteMock: vi.fn(),
  enhanceMock: vi.fn(),
}))
vi.mock('@/lib/client/writing-pipeline', () => ({
  rewriteReportForClient: rewriteMock,
  firstNameFrom: (full: string | null) => (full ?? '').trim().split(/\s+/)[0] ?? '',
}))
vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: () => false,
  enhanceEmotionalFieldWithJyotish: enhanceMock,
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn(async () => ({ data: { id: 'x' }, error: null })) }
  },
}))

import { POST } from '@/app/api/client/internal/stage2/route'

const SECRET = process.env.INTERNAL_TRIGGER_SECRET ?? 'test'

function stage2Request(token: string, secret: string = SECRET) {
  return new Request('http://localhost/api/client/internal/stage2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-trigger-secret': secret },
    body: JSON.stringify({ report_download_token: token }),
  }) as never
}

async function settle() {
  await Promise.all(waitUntilPromises.splice(0))
}

/** A row ready for stage 2: a real report attached, email null so PDF/email is skipped. */
async function seedReadyForStage2() {
  const report = await seedReport(reportContentFixture())
  const analysis = await seedAnalysis({
    status: 'stage2_processing',
    report_id: report.id,
    stage2_started_at: minutesAgo(1),
    email: null,
    language: 'en',
  })
  return { report, analysis }
}

beforeEach(async () => {
  await resetDb()
  waitUntilPromises.length = 0
  rewriteMock.mockReset().mockResolvedValue(reportContentFixture({ section_12_conclusion: 'client voice' }))
  enhanceMock.mockReset()
})

describe('POST /api/client/internal/stage2 against a real Postgres', () => {
  it('rejects a request without the internal secret', async () => {
    const { analysis } = await seedReadyForStage2()
    const res = await POST(stage2Request(analysis.report_download_token, 'wrong'))
    expect(res.status).toBe(401)
    expect(rewriteMock).not.toHaveBeenCalled()
  })

  it('runs the pipeline once and completes the row', async () => {
    const { analysis } = await seedReadyForStage2()

    const res = await POST(stage2Request(analysis.report_download_token))
    expect(res.status).toBe(200)
    await settle()

    expect(rewriteMock).toHaveBeenCalledTimes(1)
    const after = await readAnalysis(analysis.report_download_token)
    expect(after.status).toBe('completed')
    expect(after.report_delivered_at).not.toBeNull()
  })

  it('TWO CONCURRENT TRIGGERS: exactly one proceeds, rewriteReportForClient runs once', async () => {
    // The claim CASes on the exact stage2_started_at that was read. Filtering on `status`
    // alone — without changing it — matches every concurrent caller equally and therefore
    // claims nothing: both triggers would pass and both would run the full paid pipeline.
    // A mock cannot tell those two designs apart. A real row lock can.
    const { analysis } = await seedReadyForStage2()
    rewriteMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200))
      return reportContentFixture()
    })

    const [a, b] = await Promise.all([
      POST(stage2Request(analysis.report_download_token)),
      POST(stage2Request(analysis.report_download_token)),
    ])
    const bodies = [await a.json(), await b.json()]
    await settle()

    expect(rewriteMock).toHaveBeenCalledTimes(1)
    expect(bodies.filter((x) => x.skipped === true)).toHaveLength(1)
    expect(bodies.filter((x) => x.skipped === undefined)).toHaveLength(1)

    const after = await readAnalysis(analysis.report_download_token)
    expect(after.status).toBe('completed')
  })

  it('is a harmless no-op for a row that is no longer in stage2_processing', async () => {
    const report = await seedReport()
    const analysis = await seedAnalysis({
      status: 'completed',
      report_id: report.id,
      report_delivered_at: new Date().toISOString(),
    })

    const res = await POST(stage2Request(analysis.report_download_token))
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, status: 'completed' })
    expect(rewriteMock).not.toHaveBeenCalled()
  })

  it('leaves the row in stage2_processing when the rewrite fails, so the staleness retry can pick it up', async () => {
    // Deliberate: a rewrite failure must never finalize a degraded report, and must never
    // fail the row outright on the first hiccup.
    const { analysis } = await seedReadyForStage2()
    rewriteMock.mockRejectedValue(new Error('rewrite blew up'))

    await POST(stage2Request(analysis.report_download_token))
    await settle()

    const after = await readAnalysis(analysis.report_download_token)
    expect(after.status).toBe('stage2_processing')
    expect(after.report_delivered_at).toBeNull()
  })
})
