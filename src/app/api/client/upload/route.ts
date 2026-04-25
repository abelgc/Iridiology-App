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
import { detectsCorrectLanguage } from './language-check'
import { rewriteReportForClient } from '@/lib/client/writing-pipeline'
import { generateReportPdf } from '@/lib/client/pdf'

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
    const modelId = getModelForTier(row.payment_tier)

    // Generate report (attempt 1)
    let reportContent = await analyze({
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
      health_questionnaire: (row.health_questionnaire as Record<string, unknown> | null) ?? null,
      language: row.language,
      modelId,
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
      const retry = await analyze({
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
        health_questionnaire: (row.health_questionnaire as Record<string, unknown> | null) ?? null,
        language: row.language,
        modelId,
        forceLanguage: true,
      })

      // Bug fix: Check if retry failed (returned error code)
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
        // Both attempts failed — flag for manual review, do not deliver
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
    // Bug fix: Add timeout guard (30 seconds max)
    const clientReportPromise = Promise.race([
      rewriteReportForClient(finalReport, row.language),
      new Promise<ReportContent>((_, reject) =>
        setTimeout(() => reject(new Error('rewrite_timeout_exceeded')), 30000)
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
      // Bug fix: Add timeout guard for PDF generation (10 seconds max)
      const pdfBuffer = await Promise.race([
        generateReportPdf(clientReportContent),
        new Promise<Buffer>((_, reject) =>
          setTimeout(() => reject(new Error('pdf_generation_timeout')), 10000)
        ),
      ])
      await sendReportEmail({
        to: row.email,
        lang: row.language,
        analysisId: row.id,
        paymentTier: row.payment_tier,
        pdfBuffer,
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
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }
}
