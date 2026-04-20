import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientUploadSchema } from '@/lib/validators/client-upload'
import { analyze } from '@/lib/claude/analyze'
import { ReportContent } from '@/types/report'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
} from '@/lib/claude/enhance-emotional-field'
import { sendReportEmail } from '@/lib/client/email'
import { getModelForTier } from '@/lib/ai/get-provider'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = clientUploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const { data: row, error: loadError } = await supabase
    .from('client_analyses')
    .select('*')
    .eq('report_download_token', parsed.data.report_download_token)
    .single()

  if (loadError || !row) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 })
  }

  if (row.status !== 'paid') {
    return NextResponse.json({ error: 'payment_required' }, { status: 402 })
  }

  await supabase
    .from('client_analyses')
    .update({ status: 'analyzing' })
    .eq('report_download_token', parsed.data.report_download_token)
    .select()
    .single()

  try {
    const modelId = getModelForTier(row.payment_tier)
    const reportContent = await analyze({
      images: [parsed.data.right_eye_base64, parsed.data.left_eye_base64],
      patient: {
        full_name: row.email ?? 'Client',
        date_of_birth: row.date_of_birth,
        general_history: '',
        symptoms: row.main_complaint ?? '',
        practitioner_notes: row.current_medications
          ? `Current medications: ${row.current_medications}`
          : '',
      },
      language: row.language,
      modelId,
    })

    if ('code' in reportContent) {
      throw new Error(`Analysis failed: ${reportContent.message}`)
    }

    let finalReport = reportContent as ReportContent
    if (
      shouldEnhanceWithJyotish({
        date_of_birth: row.date_of_birth,
        country_of_birth: row.country_of_birth,
        city_of_birth: row.city_of_birth,
        time_of_day: row.time_of_day,
      })
    ) {
      finalReport = await enhanceEmotionalFieldWithJyotish(
        reportContent,
        'Client',
        {
          date_of_birth: row.date_of_birth,
          country_of_birth: row.country_of_birth,
          city_of_birth: row.city_of_birth,
          time_of_day: row.time_of_day,
        },
        row.language,
      )
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        report_content: finalReport,
        report_version: 1,
        is_edited: false,
      })
      .select('id')
      .single()

    if (reportError || !report) throw new Error(reportError?.message ?? 'report_insert_failed')

    await supabase
      .from('client_analyses')
      .update({
        status: 'completed',
        report_id: report.id,
        report_delivered_at: new Date().toISOString(),
      })
      .eq('report_download_token', parsed.data.report_download_token)
      .select()
      .single()

    if (row.email) {
      await sendReportEmail({
        to: row.email,
        lang: row.language,
        reportToken: parsed.data.report_download_token,
      })
    }

    return NextResponse.json(
      { report_download_token: parsed.data.report_download_token },
      { status: 200 },
    )
  } catch (err) {
    await supabase
      .from('client_analyses')
      .update({
        status: 'failed',
        failure_reason: err instanceof Error ? err.message : String(err),
      })
      .eq('report_download_token', parsed.data.report_download_token)
      .select()
      .single()
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }
}
