import { createAdminClient } from '@/lib/supabase/server'
import { triggerStage2 } from './trigger-stage2'

// Shared thresholds for rescuing analyses that stalled mid-pipeline. The poll-driven
// rescue in /api/client/reports/[token] and the cron sweep both read from here so the
// two can never drift apart — a client polling and the cron must agree on what "stuck"
// means, or they fight over the same row.

// A stage-1 or stage-2 invocation is capped at 300s by Vercel and guarded at 270s in
// app code. Past 290s the process is gone one way or another, whether or not its own
// catch block ever managed to write a verdict.
export const STALE_CEILING_MS = 290_000

// Two rescue attempts, then the row is declared failed. Beyond that we are almost
// certainly retrying something deterministic (a bad prompt, a poisoned input) and just
// spending money to fail again.
export const MAX_STAGE2_RETRIES = 2

// The cron ignores anything older than this. Resurrecting a days-old analysis serves
// nobody — that client is long gone — while still costing a full paid AI run. Without
// this guard, the sweep's very first execution would re-run every corpse in the table
// at once. Recent stalls are the ones a real person is still waiting on.
export const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type SweepResult = {
  scanned: number
  retried: number
  failed: number
}

export async function sweepStaleAnalyses(): Promise<SweepResult> {
  const supabase = createAdminClient()
  const now = Date.now()
  const stalledBefore = new Date(now - STALE_CEILING_MS).toISOString()
  const ignoreOlderThan = new Date(now - SWEEP_MAX_AGE_MS).toISOString()

  // Both bounds matter. `lt` is what makes a row stale; `gt` is what stops the sweep from
  // resurrecting corpses. A row is only rescued if it is old enough to be stuck and recent
  // enough that someone might still be waiting for it.
  const { data: rows } = await supabase
    .from('client_analyses')
    .select('report_download_token, stage2_started_at, stage2_retry_count')
    .eq('status', 'stage2_processing')
    .lt('stage2_started_at', stalledBefore)
    .gt('stage2_started_at', ignoreOlderThan)

  const stale = rows ?? []
  let retried = 0
  let failed = 0

  for (const row of stale) {
    const retryCount = row.stage2_retry_count ?? 0

    if (retryCount >= MAX_STAGE2_RETRIES) {
      // CAS on status AND the exact timestamp read above: if stage 2 quietly finished
      // between the select and here, this write matches nothing and we leave the real
      // verdict alone rather than stamping 'failed' over a delivered report.
      const { data: claimed } = await supabase
        .from('client_analyses')
        .update({ status: 'failed', failure_reason: 'stage2_stale_after_retries' })
        .eq('report_download_token', row.report_download_token)
        .eq('status', 'stage2_processing')
        .eq('stage2_started_at', row.stage2_started_at)
        .select('status')
        .single()
      if (claimed) failed += 1
      continue
    }

    // CAS on the exact retry_count read above, mirroring the poll-driven rescue: if a
    // client's browser is polling the same row at the same moment, only one of us wins
    // the increment. The loser does not call triggerStage2, so stage 2 never double-runs.
    const { data: claimed } = await supabase
      .from('client_analyses')
      .update({ stage2_retry_count: retryCount + 1 })
      .eq('report_download_token', row.report_download_token)
      .eq('status', 'stage2_processing')
      .eq('stage2_retry_count', retryCount)
      .select('status')
      .single()

    if (claimed) {
      await triggerStage2(row.report_download_token)
      retried += 1
    }
  }

  return { scanned: stale.length, retried, failed }
}
