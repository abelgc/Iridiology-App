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
  const { data, error } = await supabase
    .from('client_analyses')
    .update({
      paid_at: new Date().toISOString(),
      is_mock_payment: true,
      status: 'paid',
      failure_reason: null, // clear any stale reason from a prior failed attempt on this token
    })
    .eq('report_download_token', token)
    .select('report_download_token, status')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'db_update_failed' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
