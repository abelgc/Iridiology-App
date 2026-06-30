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
import { waitUntil } from '@vercel/functions'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

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

  const token = parsed.data.report_download_token

  await supabase
    .from('client_analyses')
    .update({ status: 'analyzing' })
    .eq('report_download_token', token)

  const runAnalysis = async () => {
    const bg = createAdminClient()
    const startedAt = Date.now()
    const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`
    console.log(`[client-upload] token ${token} — starting analysis...`)

    let completed = false
    let savedClientReport: ReportContent | null = null

    try {
      await withTimeout(
        (async () => {
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
            health_questionnaire:
              (row.health_questionnaire as Record<string, unknown> | null) ?? null,
          }

          let reportContent = await analyzeIrisDual(analysisRequest, row.language, {
            providers: clientProviders,
          })

          if ('code' in reportContent) {
            throw new Error(`Analysis failed: ${(reportContent as any).message}`)
          }

          // Language check — retry once; if still wrong, proceed with flag set
          let languageFlagged = false
          const languageOk = detectsCorrectLanguage(
            (reportContent as ReportContent).section_1_general_terrain,
            row.language,
          )

          if (!languageOk) {
            const retry = await analyzeIrisDual(analysisRequest, row.language, {
              providers: clientProviders,
              forceLanguage: true,
            })
            if (!('code' in retry)) {
              const retryOk = detectsCorrectLanguage(
                (retry as ReportContent).section_1_general_terrain,
                row.language,
              )
              if (retryOk) {
                reportContent = retry
              } else {
                languageFlagged = true
              }
            } else {
              languageFlagged = true
            }
          }

          let finalReport = reportContent as ReportContent

          if (
            row.payment_tier === 'premium_19_90' &&
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

          const clientReportContent = await Promise.race([
            rewriteReportForClient(finalReport, row.language),
            new Promise<ReportContent>((_, reject) =>
              setTimeout(() => reject(new Error('rewrite_timeout_exceeded')), 120000),
            ),
          ])

          const { data: report, error: reportError } = await bg
            .from('reports')
            .insert({
              report_content: finalReport,
              report_version: 1,
              is_edited: false,
            })
            .select('id')
            .single()

          if (reportError || !report)
            throw new Error(reportError?.message ?? 'report_insert_failed')

          await bg
            .from('reports')
            .update({ client_report_content: clientReportContent })
            .eq('id', report.id)

          await bg
            .from('client_analyses')
            .update({
              status: 'completed',
              report_id: report.id,
              report_delivered_at: new Date().toISOString(),
              ...(languageFlagged ? { language_flag: true } : {}),
            })
            .eq('report_download_token', token)

          completed = true
          savedClientReport = clientReportContent
          console.log(`[client-upload] token ${token} — completed in ${elapsed()} ✓`)
        })(),
        240_000,
        'Analysis timed out after 240s',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `\x1b[31m[client-upload] token ${token} — failed after ${elapsed()}: ${msg}\x1b[0m`,
      )
      if (!completed) {
        await createAdminClient()
          .from('client_analyses')
          .update({ status: 'failed', failure_reason: msg })
          .eq('report_download_token', token)
      }
      return
    }

    // PDF + email — best-effort after completion, outside the 240s analysis guard
    if (row.email && savedClientReport) {
      try {
        const pdfBuffer = await Promise.race([
          generateReportPdf(savedClientReport, row.language),
          new Promise<Buffer>((_, reject) =>
            setTimeout(() => reject(new Error('pdf_generation_timeout')), 60000),
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
          console.error(`[client-upload] token ${token} — email failed:`, emailResult.error)
        }
      } catch (err) {
        console.error(`[client-upload] token ${token} — pdf/email error:`, err)
      }
    }
  }

  waitUntil(runAnalysis())

  return NextResponse.json({ report_download_token: token })
}
