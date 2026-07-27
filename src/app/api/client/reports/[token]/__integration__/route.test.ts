import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  seedAnalysis,
  seedReport,
  resetDb,
  readAnalysis,
  reportContentFixture,
  minutesAgo,
  testDb,
} from '@/test/integration-factories'

const { triggerStage2Mock } = vi.hoisted(() => ({ triggerStage2Mock: vi.fn(async () => {}) }))
vi.mock('@/lib/client/trigger-stage2', () => ({ triggerStage2: triggerStage2Mock }))

import { GET } from '@/app/api/client/reports/[token]/route'

function get(token: string) {
  return GET(new Request(`http://localhost/api/client/reports/${token}`) as never, {
    params: Promise.resolve({ token }),
  })
}

beforeEach(async () => {
  await resetDb()
  triggerStage2Mock.mockClear()
})

describe('GET /api/client/reports/[token] against a real Postgres', () => {
  it('serves a report from a row whose status reads "failed", when the content and a delivery date exist', async () => {
    // Production holds a row from 2026-07-07 exactly like this: client_report_content and
    // report_delivered_at both set — the report WAS written and delivered — while status
    // reads 'failed', because a terminal write lost a race with the stale-timeout guard.
    // Content decides, not the label; demanding status === 'completed' made that finished,
    // paid report unreachable for good.
    const report = await seedReport()
    await testDb()
      .from('reports')
      .update({ client_report_content: reportContentFixture({ section_12_conclusion: 'delivered' }) })
      .eq('id', report.id)

    const row = await seedAnalysis({
      status: 'failed',
      report_id: report.id,
      report_delivered_at: new Date().toISOString(),
      language: 'en',
    })

    const res = await get(row.report_download_token)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.report.section_12_conclusion).toBe('delivered')
    expect(body.language).toBe('en')
    expect(body.deliveredAt).not.toBeNull()
  })

  it('refuses a failed row that has no content, so a genuine failure is never dressed up as a report', async () => {
    const row = await seedAnalysis({ status: 'failed', report_id: null })

    const res = await get(row.report_download_token)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'not_ready', status: 'failed' })
  })

  it('refuses a failed row that HAS content but no delivery date', async () => {
    // Same row as the first test minus report_delivered_at: nothing was ever delivered, so
    // the content is a half-finished artefact, not a report.
    const report = await seedReport()
    await testDb()
      .from('reports')
      .update({ client_report_content: reportContentFixture() })
      .eq('id', report.id)
    const row = await seedAnalysis({
      status: 'failed',
      report_id: report.id,
      report_delivered_at: null,
    })

    const res = await get(row.report_download_token)
    expect(res.status).toBe(409)
  })

  it('rejects a token that is not a v4 UUID before it reaches the database', async () => {
    const res = await get('definitely-not-a-token')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_token' })
  })

  it('TWO CONCURRENT POLLS on a stale stage2 row increment the retry count exactly once', async () => {
    // Two browser tabs polling the same stale row. Both read stage2_retry_count = 0 and both
    // try to claim the retry. Without the `.eq('stage2_retry_count', current)` CAS this is a
    // lost update: both write 1, silently granting an extra retry, and both call
    // triggerStage2 — double-running the whole paid stage 2. The mocked suite cannot see it,
    // because its `.eq()` throws its arguments away.
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(10),
      stage2_retry_count: 0,
    })

    const [a, b] = await Promise.all([
      get(row.report_download_token),
      get(row.report_download_token),
    ])

    expect(a.status).toBe(409)
    expect(b.status).toBe(409)

    const after = await readAnalysis(row.report_download_token)
    expect(after.stage2_retry_count).toBe(1) // not 2
    expect(triggerStage2Mock).toHaveBeenCalledTimes(1)
  })

  it('fails a stale stage2 row that has exhausted its retries, exactly once across concurrent polls', async () => {
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(10),
      stage2_retry_count: 2,
    })

    const [a, b] = await Promise.all([
      get(row.report_download_token),
      get(row.report_download_token),
    ])
    const bodies = [await a.json(), await b.json()]

    // Whoever won the CAS gets the synthesized 'failed'; the loser re-reads and reports the
    // same verdict rather than inventing a second one.
    expect(bodies.every((x) => x.error === 'not_ready')).toBe(true)
    expect(bodies.every((x) => x.status === 'failed')).toBe(true)
    expect(triggerStage2Mock).not.toHaveBeenCalled()

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('failed')
    expect(after.failure_reason).toBe('stage2_stale_after_retries')
  })

  it('synthesizes a failure for a row stuck in "analyzing" past the 290s ceiling', async () => {
    const row = await seedAnalysis({
      status: 'analyzing',
      analyzing_started_at: minutesAgo(10),
    })

    const res = await get(row.report_download_token)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'not_ready', status: 'failed' })

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('failed')
    expect(after.failure_reason).toBe('stale_timeout_synthesized')
  })

  it('leaves a freshly-started stage2 row alone', async () => {
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(1),
      stage2_retry_count: 0,
    })

    const res = await get(row.report_download_token)
    expect(res.status).toBe(409)
    expect(triggerStage2Mock).not.toHaveBeenCalled()
    expect((await readAnalysis(row.report_download_token)).stage2_retry_count).toBe(0)
  })

  it('answers 404 for an unknown token', async () => {
    const res = await get(crypto.randomUUID())
    expect(res.status).toBe(404)
  })
})
