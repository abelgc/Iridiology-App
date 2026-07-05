import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { triggerStage2 } from '@/lib/client/trigger-stage2'

const SELECT_COLUMNS = `
      report_download_token,
      language,
      status,
      payment_tier,
      report_delivered_at,
      report_id,
      analyzing_started_at,
      stage2_started_at,
      stage2_retry_count,
      reports:report_id ( id, report_content, client_report_content )
    `

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('client_analyses')
    .select(SELECT_COLUMNS)
    .eq('report_download_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let current = data

  // Belt-and-braces against a hard Vercel process kill (maxDuration=300s) landing between the
  // 270s internal analysis timeout and its own catch-block DB write: if a row has been
  // 'analyzing' longer than this, treat it as failed regardless of whether that write ever
  // completed. Computed purely from elapsed time so it can't be defeated by a killed process.
  const STALE_ANALYSIS_CEILING_MS = 290_000
  if (current.status === 'analyzing' && current.analyzing_started_at) {
    const elapsedMs = Date.now() - new Date(current.analyzing_started_at).getTime()
    if (elapsedMs > STALE_ANALYSIS_CEILING_MS) {
      // Guard on both status AND the exact timestamp we read: if this loses the race, stage 1
      // actually finished under us — re-read and fall through with fresh data instead of
      // telling the client "failed" when it just succeeded.
      const { data: failClaimed } = await supabase
        .from('client_analyses')
        .update({ status: 'failed', failure_reason: 'stale_timeout_synthesized' })
        .eq('report_download_token', token)
        .eq('status', 'analyzing')
        .eq('analyzing_started_at', current.analyzing_started_at)
        .select('status')
        .single()
      if (failClaimed) {
        return NextResponse.json({ error: 'not_ready', status: 'failed' }, { status: 409 })
      }
      const { data: fresh } = await supabase
        .from('client_analyses')
        .select(SELECT_COLUMNS)
        .eq('report_download_token', token)
        .single()
      if (fresh) current = fresh
    }
  }

  // Stage 2 (Jyotish + client rewrite + PDF + email) runs in its own fresh invocation,
  // triggered by stage 1 handing off. If it's been running longer than this without
  // completing, either the trigger call itself failed or its invocation died — retry it
  // (bounded) rather than leaving the client stuck.
  const STALE_STAGE2_CEILING_MS = 290_000
  if (current.status === 'stage2_processing' && current.stage2_started_at) {
    const elapsedMs = Date.now() - new Date(current.stage2_started_at).getTime()
    if (elapsedMs > STALE_STAGE2_CEILING_MS) {
      if ((current.stage2_retry_count ?? 0) >= 2) {
        // Guard on both status AND the exact timestamp we read: if this loses the race, stage 2
        // actually finished under us — re-read and fall through with fresh data.
        const { data: failClaimed } = await supabase
          .from('client_analyses')
          .update({ status: 'failed', failure_reason: 'stage2_stale_after_retries' })
          .eq('report_download_token', token)
          .eq('status', 'stage2_processing')
          .eq('stage2_started_at', current.stage2_started_at)
          .select('status')
          .single()
        if (failClaimed) {
          return NextResponse.json({ error: 'not_ready', status: 'failed' }, { status: 409 })
        }
        const { data: fresh } = await supabase
          .from('client_analyses')
          .select(SELECT_COLUMNS)
          .eq('report_download_token', token)
          .single()
        if (fresh) current = fresh
      } else {
        // CAS on the exact retry_count we just read: two concurrent pollers (two tabs) seeing
        // the same stale row would otherwise both write the same incremented count (a lost
        // update, silently granting extra retries) and both call triggerStage2 concurrently,
        // double-running stage 2. Only the first caller's write matches; the second's is a no-op.
        const { data: retryClaimed } = await supabase
          .from('client_analyses')
          .update({ stage2_retry_count: (current.stage2_retry_count ?? 0) + 1 })
          .eq('report_download_token', token)
          .eq('status', 'stage2_processing')
          .eq('stage2_retry_count', current.stage2_retry_count ?? 0)
          .select('status')
          .single()
        if (retryClaimed) {
          await triggerStage2(token)
        }
      }
    }
  }

  if (current.status !== 'completed' || !current.reports) {
    return NextResponse.json(
      { error: 'not_ready', status: current.status },
      { status: 409 },
    )
  }

  const reports = current.reports as any
  const report = reports.client_report_content ?? reports.report_content

  return NextResponse.json({
    language: current.language,
    report,
    paymentTier: current.payment_tier,
    deliveredAt: current.report_delivered_at ?? null,
  })
}
