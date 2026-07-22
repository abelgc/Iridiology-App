import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'

export async function POST(request: NextRequest) {
  if (!process.env.ENABLE_MOCK_PAYMENT) {
    return NextResponse.json({ error: 'mock_payment_disabled' }, { status: 403 })
  }

  let body: { report_download_token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const token = body.report_download_token
  if (!token || !isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: row, error: loadError } = await supabase
    .from('client_analyses')
    .select('report_download_token, status')
    .eq('report_download_token', token)
    .single()

  if (loadError || !row) {
    return NextResponse.json({ error: 'token_not_found' }, { status: 404 })
  }

  // Already progressed past payment (e.g. back-button replay) — idempotent no-op,
  // let the client proceed instead of re-arming an in-flight or finished analysis.
  if (row.status !== 'intake_pending') {
    return NextResponse.json(
      { report_download_token: row.report_download_token, status: row.status },
      { status: 200 },
    )
  }

  // Guard: only transition from 'intake_pending' — same CAS pattern as
  // /api/client/upload and /api/client/internal/stage2, so a retried/replayed
  // POST can never clobber a row that has since moved on.
  const { data, error } = await supabase
    .from('client_analyses')
    .update({
      paid_at: new Date().toISOString(),
      is_mock_payment: true,
      status: 'paid',
      failure_reason: null,
    })
    .eq('report_download_token', token)
    .eq('status', 'intake_pending')
    .select('report_download_token, status')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'already_processing' }, { status: 409 })
  }

  return NextResponse.json(data, { status: 200 })
}
