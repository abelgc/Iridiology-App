import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientUploadSchema } from '@/lib/validators/client-upload'
import { analyzeIrisDual } from '@/lib/claude/analyze-dual'
import { ReportContent } from '@/types/report'
import type { AnalysisRequest } from '@/types/claude'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
} from '@/lib/claude/enhance-emotional-field'
import { sendReportEmail } from '@/lib/client/email'
import { getClientProviders } from '@/lib/ai/get-provider'
import { detectsCorrectLanguage } from './language-check'
import { rewriteReportForClient } from '@/lib/client/writing-pipeline'
import { generateReportPdf } from '@/lib/client/pdf'

function extractBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
  return match ? match[1] : dataUrl
}

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

  try {
    const clientProviders = await getClientProviders(row.payment_tier)

    const analysisRequest: AnalysisRequest = {
      sessionId: '',
      patientId: '',
      rightIrisBase64: extractBase64(parsed.data.right_eye_base64),
      leftIrisBase64: extractBase64(parsed.data.left_eye_base64),
      patientData: {
        full_name: row.email ?? 'Client',
        date_of_birth: row.date_of_birth,
        gender: null,
        general_history: '',
        symptoms: row.main_complaint ?? '',
        practitioner_notes: row.current_medications
          ? `Current medications: ${row.current_medications}`
          : '',
      },
      health_questionnaire: (row.health_questionnaire as Record<string, unknown> | null) ?? null,
    }

    // Generate report (attempt 1)
    let reportContent = await analyzeIrisDual(analysisRequest, row.language, {
      providers: clientProviders,
    })

    if ('code' in reportContent) {
      throw new Error(`Analysis failed: ${reportContent.message}`)
    }

    // Language check — retry once if wrong language detected
    const languageOk = detectsCorrectLanguage(
      (reportContent as ReportContent).section_1_general_terrain,
      row.language
    )

    if (!languageOk) {
      const retry = await analyzeIrisDual(analysisRequest, row.language, {
        providers: clientProviders,
        forceLanguage: true,
      })

      if ('code' in retry) {
        throw new Error(`Retry analysis also failed: ${retry.message}`)
      }

      const retryOk = detectsCorrectLanguage(
        (retry as ReportContent).section_1_general_terrain,
        row.language
      )
      if (retryOk) {
        reportContent = retry
      } else {
        await supabase
          .from('client_analyses')
          .update({ language_flag: true })
          .eq('report_download_token', parsed.data.report_download_token)
        return NextResponse.json(
          { report_download_token: parsed.data.report_download_token, language_flag: true },
          { status: 200 },
        )
      }
    }

    let finalReport = reportContent as ReportContent

    // Jyotish enhancement (optional)
    if (
      shouldEnhanceWithJyotish({
        date_of_birth: row.date_of_birth,
        country_of_birth: row.country_of_birth,
        city_of_birth: row.city_of_birth,
        time_of_day: row.time_of_day,
      })
    ) {
      finalReport = await enhanceEmotionalFieldWithJyotish(
        reportContent as ReportContent,
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

    // Rewrite for client (4-agent pipeline) — runs in parallel with DB insert below
    const clientReportPromise = Promise.race([
      rewriteReportForClient(finalReport, row.language),
      new Promise<ReportContent>((_, reject) =>
        setTimeout(() => reject(new Error('rewrite_timeout_exceeded')), 120000)
      ),
    ])

    // Insert practitioner report
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

    // Wait for client rewrite and save
    const clientReportContent = await clientReportPromise
    await supabase
      .from('reports')
      .update({ client_report_content: clientReportContent })
      .eq('id', report.id)

    await supabase
      .from('client_analyses')
      .update({
        status: 'completed',
        report_id: report.id,
        report_delivered_at: new Date().toISOString(),
      })
      .eq('report_download_token', parsed.data.report_download_token)

    // Generate PDF and email
    if (row.email) {
      const pdfBuffer = await Promise.race([
        generateReportPdf(clientReportContent),
        new Promise<Buffer>((_, reject) =>
          setTimeout(() => reject(new Error('pdf_generation_timeout')), 60000)
        ),
      ])
      const emailResult = await sendReportEmail({
        to: row.email,
        lang: row.language,
        analysisId: row.id,
        paymentTier: row.payment_tier,
        pdfBuffer,
      })
      if (!emailResult.ok) {
        console.error('[upload] email failed:', emailResult.error)
      }
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
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }
}
