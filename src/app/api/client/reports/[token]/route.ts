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
      report_id,
      reports:report_id ( id, report_content )
    `)
    .eq('report_download_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (data.status !== 'completed' || !data.reports) {
    return NextResponse.json(
      { error: 'not_ready', status: data.status },
      { status: 409 },
    )
  }

  return NextResponse.json({
    language: data.language,
    report: (data.reports as any).report_content,
  })
}
