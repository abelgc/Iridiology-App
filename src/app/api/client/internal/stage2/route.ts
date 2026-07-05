import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ReportContent } from '@/types/report'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
} from '@/lib/claude/enhance-emotional-field'
import { sendReportEmail } from '@/lib/client/email'
import { rewriteReportForClient } from '@/lib/client/writing-pipeline'
import { generateReportPdf } from '@/lib/client/pdf'
import { waitUntil } from '@vercel/functions'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-trigger-secret')
  if (!secret || secret !== process.env.INTERNAL_TRIGGER_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const token = (body as { report_download_token?: string })?.report_download_token
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: row, error: loadError } = await supabase
    .from('client_analyses')
    .select('*, reports:report_id ( id, report_content )')
    .eq('report_download_token', token)
    .single()

  if (loadError || !row) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 })
  }

  // Only proceed from stage2_processing — 'completed'/'failed' means someone else already
  // finished this (or is about to); a stale re-trigger racing a fresh one is a harmless no-op.
  if (row.status !== 'stage2_processing') {
    return NextResponse.json({ ok: true, skipped: true, status: row.status })
  }

  const { data: claimed } = await supabase
    .from('client_analyses')
    .update({ stage2_started_at: new Date().toISOString() })
    .eq('report_download_token', token)
    .eq('status', 'stage2_processing')
    .select('report_download_token')
    .single()

  if (!claimed) {
    // Someone else's trigger already claimed this run in the tiny window above.
    return NextResponse.json({ ok: true, skipped: true })
  }

  const finalReport = (row as any).reports?.report_content as ReportContent | undefined
  if (!finalReport) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  const runStage2 = async () => {
    const bg = createAdminClient()
    const startedAt = Date.now()
    const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`
    console.log(`[client-stage2] token ${token} — starting stage 2...`)

    let completed = false
    let savedClientReport: ReportContent | null = null

    try {
      await withTimeout(
        (async () => {
          let enhancedReport = finalReport

          if (
            row.payment_tier === 'premium_19_90' &&
            shouldEnhanceWithJyotish({
              date_of_birth: row.date_of_birth,
              country_of_birth: row.country_of_birth,
              city_of_birth: row.city_of_birth,
              time_of_day: row.time_of_day,
            })
          ) {
            enhancedReport = await enhanceEmotionalFieldWithJyotish(
              finalReport,
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
            rewriteReportForClient(enhancedReport, row.language),
            new Promise<ReportContent>((_, reject) =>
              setTimeout(() => reject(new Error('rewrite_timeout_exceeded')), 120000),
            ),
          ])

          await bg
            .from('reports')
            .update({ report_content: enhancedReport, client_report_content: clientReportContent })
            .eq('id', row.report_id)

          await bg
            .from('client_analyses')
            .update({ status: 'completed', report_delivered_at: new Date().toISOString() })
            .eq('report_download_token', token)

          completed = true
          savedClientReport = clientReportContent
          console.log(`[client-stage2] token ${token} — completed in ${elapsed()} ✓`)
        })(),
        270_000,
        'Stage 2 timed out after 270s',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`\x1b[31m[client-stage2] token ${token} — failed after ${elapsed()}: ${msg}\x1b[0m`)
      if (!completed) {
        await createAdminClient()
          .from('client_analyses')
          .update({ status: 'failed', failure_reason: msg })
          .eq('report_download_token', token)
      }
      return
    }

    if (row.email && savedClientReport) {
      try {
        const pdfBuffer = await Promise.race([
          generateReportPdf(savedClientReport, row.language, row.payment_tier === 'premium_19_90'),
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
          console.error(`[client-stage2] token ${token} — email failed:`, emailResult.error)
        }
      } catch (err) {
        console.error(`[client-stage2] token ${token} — pdf/email error:`, err)
      }
    }
  }

  waitUntil(runStage2())
  return NextResponse.json({ ok: true })
}
