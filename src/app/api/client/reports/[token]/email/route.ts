import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { sendReportEmail } from '@/lib/client/email'
import { generateReportPdf } from '@/lib/client/pdf'
import type { ReportContent } from '@/types/report'

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
    .select(`
      id,
      email,
      language,
      status,
      payment_tier,
      reports:report_id ( client_report_content, report_content )
    `)
    .eq('report_download_token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (data.status !== 'completed') return NextResponse.json({ error: 'not_ready' }, { status: 409 })
  if (!data.email) return NextResponse.json({ error: 'email_unavailable' }, { status: 410 })

  const reports = data.reports as any
  const reportForPdf: ReportContent =
    reports?.client_report_content ?? reports?.report_content

  if (!reportForPdf) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  const pdfBuffer = await generateReportPdf(reportForPdf, data.language, data.payment_tier === 'premium_2990')

  const result = await sendReportEmail({
    to: data.email,
    lang: data.language,
    analysisId: data.id,
    paymentTier: data.payment_tier,
    pdfBuffer,
  })

  if (!result.ok && result.error !== 'already_sent' as any) {
    return NextResponse.json({ error: 'email_failed', detail: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
