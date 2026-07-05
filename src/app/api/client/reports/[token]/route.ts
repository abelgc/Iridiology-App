import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'

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
    .select(`
      report_download_token,
      language,
      status,
      payment_tier,
      report_delivered_at,
      report_id,
      analyzing_started_at,
      reports:report_id ( id, report_content, client_report_content )
    `)
    .eq('report_download_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Belt-and-braces against a hard Vercel process kill (maxDuration=300s) landing between the
  // 270s internal analysis timeout and its own catch-block DB write: if a row has been
  // 'analyzing' longer than this, treat it as failed regardless of whether that write ever
  // completed. Computed purely from elapsed time so it can't be defeated by a killed process.
  const STALE_ANALYSIS_CEILING_MS = 290_000
  if (data.status === 'analyzing' && data.analyzing_started_at) {
    const elapsedMs = Date.now() - new Date(data.analyzing_started_at).getTime()
    if (elapsedMs > STALE_ANALYSIS_CEILING_MS) {
      await supabase
        .from('client_analyses')
        .update({ status: 'failed', failure_reason: 'stale_timeout_synthesized' })
        .eq('report_download_token', token)
      return NextResponse.json({ error: 'not_ready', status: 'failed' }, { status: 409 })
    }
  }

  if (data.status !== 'completed' || !data.reports) {
    return NextResponse.json(
      { error: 'not_ready', status: data.status },
      { status: 409 },
    )
  }

  const reports = data.reports as any
  const report = reports.client_report_content ?? reports.report_content

  return NextResponse.json({
    language: data.language,
    report,
    paymentTier: data.payment_tier,
    deliveredAt: data.report_delivered_at ?? null,
  })
}
