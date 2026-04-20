import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { sendReportEmail } from '@/lib/client/email'

export async function POST(
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
    .select('email, language, status')
    .eq('report_download_token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (data.status !== 'completed') return NextResponse.json({ error: 'not_ready' }, { status: 409 })
  if (!data.email) return NextResponse.json({ error: 'email_unavailable' }, { status: 410 })

  const result = await sendReportEmail({
    to: data.email,
    lang: data.language,
    reportToken: token,
  })

  if (!result.ok) {
    return NextResponse.json({ error: 'email_failed', detail: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
