import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  seedAnalysis,
  resetDb,
  readAnalysis,
  minutesAgo,
  testDb,
} from '@/test/integration-factories'

// The ONLY thing mocked in this file. triggerStage2 fires an HTTP POST at a running Next
// server and, downstream of that, at paid AI providers. Everything else — the SELECT, the
// two bounds on stage2_started_at, and both compare-and-swap UPDATEs — runs against a real
// Postgres, because a compare-and-swap is a claim about what the DATABASE does when two
// writers collide, and a mock cannot make that claim.
const { triggerStage2Mock } = vi.hoisted(() => ({ triggerStage2Mock: vi.fn(async () => {}) }))
vi.mock('@/lib/client/trigger-stage2', () => ({ triggerStage2: triggerStage2Mock }))

import { sweepStaleAnalyses, MAX_STAGE2_RETRIES } from '@/lib/client/rescue'

// STALE_CEILING_MS is 290s ≈ 4.83 min, SWEEP_MAX_AGE_MS is 24 h.
const TOO_YOUNG_MIN = 2 // < 4.83 min old: still legitimately running
const STALE_MIN = 10 // between the two bounds: the only rescuable window
const TOO_OLD_MIN = 25 * 60 // 25 h: past SWEEP_MAX_AGE_MS, a corpse

beforeEach(async () => {
  // The sweep scans the ENTIRE client_analyses table — it has no notion of "this test's
  // rows". A single leftover row from a previous test would be picked up here and make
  // `scanned` meaningless, so the table starts empty every time.
  await resetDb()
  triggerStage2Mock.mockClear()
})

describe('sweepStaleAnalyses against a real Postgres', () => {
  it('scans exactly the one row inside BOTH time bounds and triggers stage 2 only for it', async () => {
    // Three rows, all 'stage2_processing', differing only in age. `lt(stalledBefore)` is what
    // makes a row stale; `gt(ignoreOlderThan)` is what stops the sweep resurrecting corpses.
    // Swap those two operators in rescue.ts and the WHERE becomes unsatisfiable — no row is
    // ever selected. The mocked suite cannot see that, because its `eq`/`lt`/`gt` return
    // whatever rows the test author pre-loaded regardless of the filters applied.
    const tooYoung = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(TOO_YOUNG_MIN),
    })
    const stale = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(STALE_MIN),
    })
    const tooOld = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(TOO_OLD_MIN),
    })

    const result = await sweepStaleAnalyses()

    expect(result).toEqual({ scanned: 1, retried: 1, failed: 0 })
    expect(triggerStage2Mock).toHaveBeenCalledTimes(1)
    expect(triggerStage2Mock).toHaveBeenCalledWith(stale.report_download_token)

    // And prove it by state, not just by call count: only the stale row moved.
    expect((await readAnalysis(stale.report_download_token)).stage2_retry_count).toBe(1)
    expect((await readAnalysis(tooYoung.report_download_token)).stage2_retry_count).toBe(0)
    expect((await readAnalysis(tooOld.report_download_token)).stage2_retry_count).toBe(0)
  })

  it('leaves a row that is younger than the stale ceiling completely alone', async () => {
    const young = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(TOO_YOUNG_MIN),
    })

    expect(await sweepStaleAnalyses()).toEqual({ scanned: 0, retried: 0, failed: 0 })
    expect(triggerStage2Mock).not.toHaveBeenCalled()
    const after = await readAnalysis(young.report_download_token)
    expect(after.status).toBe('stage2_processing')
    expect(after.stage2_retry_count).toBe(0)
  })

  it('marks a row that has already used up its retries as failed, with the documented reason', async () => {
    const exhausted = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(STALE_MIN),
      stage2_retry_count: MAX_STAGE2_RETRIES,
    })

    const result = await sweepStaleAnalyses()

    expect(result).toEqual({ scanned: 1, retried: 0, failed: 1 })
    expect(triggerStage2Mock).not.toHaveBeenCalled()

    // Re-read from the database. Never assert on what the mutation claimed to return.
    const after = await readAnalysis(exhausted.report_download_token)
    expect(after.status).toBe('failed')
    expect(after.failure_reason).toBe('stage2_stale_after_retries')
    // The retry count is NOT bumped on the failure path — it is already at the ceiling.
    expect(after.stage2_retry_count).toBe(MAX_STAGE2_RETRIES)
  })

  it('THE ONE NO MOCK CAN EXPRESS: two concurrent sweeps on one stale row produce exactly one retry', async () => {
    // This is the defect class behind the 7 dead analyses in production. Two writers — the
    // cron and a polling browser, or two overlapping cron invocations — read the same
    // stage2_retry_count and both try to claim it.
    //
    // The guard is `.eq('stage2_retry_count', retryCount)` in the UPDATE's WHERE. Under
    // Postgres READ COMMITTED the second UPDATE blocks on the row lock, then re-evaluates
    // its WHERE against the row the winner just wrote, matches nothing, and returns zero
    // rows — so the loser never calls triggerStage2 and stage 2 never double-runs.
    //
    // No mock can produce this result. A mock's `.eq()` has no rows, no locks and no
    // isolation level; it returns whatever the author imagined, so both callers "win".
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(STALE_MIN),
      stage2_retry_count: 0,
    })

    const [a, b] = await Promise.all([sweepStaleAnalyses(), sweepStaleAnalyses()])

    const after = await readAnalysis(row.report_download_token)
    expect(after.stage2_retry_count).toBe(1) // not 2 — no lost update
    expect(triggerStage2Mock).toHaveBeenCalledTimes(1) // stage 2 ran once, not twice
    expect(triggerStage2Mock).toHaveBeenCalledWith(row.report_download_token)

    // Both sweeps saw the row; exactly one of them claimed it.
    expect(a.scanned + b.scanned).toBeGreaterThanOrEqual(1)
    expect(a.retried + b.retried).toBe(1)
  })

  it('two concurrent sweeps on an exhausted row write the failure verdict exactly once', async () => {
    // The other compare-and-swap in the same loop: CAS on status AND the exact
    // stage2_started_at read above, so a row that quietly finished between the SELECT and
    // the UPDATE never gets 'failed' stamped over a delivered report.
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(STALE_MIN),
      stage2_retry_count: MAX_STAGE2_RETRIES,
    })

    const [a, b] = await Promise.all([sweepStaleAnalyses(), sweepStaleAnalyses()])

    expect(a.failed + b.failed).toBe(1)
    expect((await readAnalysis(row.report_download_token)).status).toBe('failed')
  })

  it('does not touch a row that finished between the select and the claim', async () => {
    // Simulates the CAS losing for the honest reason: stage 2 completed under the sweep.
    // The sweep must leave the delivered verdict alone rather than stamping over it.
    const row = await seedAnalysis({
      status: 'stage2_processing',
      stage2_started_at: minutesAgo(STALE_MIN),
      stage2_retry_count: MAX_STAGE2_RETRIES,
    })

    const sweep = sweepStaleAnalyses()
    // Flip the row to completed while the sweep is in flight.
    await testDb()
      .from('client_analyses')
      .update({ status: 'completed', report_delivered_at: new Date().toISOString() })
      .eq('report_download_token', row.report_download_token)

    await sweep

    const after = await readAnalysis(row.report_download_token)
    expect(after.status).toBe('completed')
    expect(after.failure_reason).toBeNull()
  })

  it('ignores rows in every status other than stage2_processing', async () => {
    for (const status of ['intake_pending', 'paid', 'analyzing', 'completed', 'failed']) {
      await seedAnalysis({ status, stage2_started_at: minutesAgo(STALE_MIN) })
    }

    expect(await sweepStaleAnalyses()).toEqual({ scanned: 0, retried: 0, failed: 0 })
    expect(triggerStage2Mock).not.toHaveBeenCalled()
  })
})
