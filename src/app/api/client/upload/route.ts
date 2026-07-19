import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientUploadSchema } from '@/lib/validators/client-upload'
import { analyzeIrisDual } from '@/lib/claude/analyze-dual'
import { ReportContent } from '@/types/report'
import type { AnalysisRequest } from '@/types/claude'
import { getClientProviders } from '@/lib/ai/get-provider'
import { detectsCorrectLanguage } from './language-check'
import { triggerStage2 } from '@/lib/client/trigger-stage2'
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

  // Guard: only proceed if still 'paid' — prevents a duplicate/retried POST for the same
  // token from starting a second concurrent analysis run.
  const { data: claimedAnalyzing } = await supabase
    .from('client_analyses')
    .update({ status: 'analyzing', analyzing_started_at: new Date().toISOString() })
    .eq('report_download_token', token)
    .eq('status', 'paid')
    .select('status')
    .single()

  if (!claimedAnalyzing) {
    return NextResponse.json({ error: 'already_processing' }, { status: 409 })
  }

  const runAnalysis = async () => {
    const bg = createAdminClient()
    const startedAt = Date.now()
    const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`
    console.log(`[client-upload] token ${token} — starting analysis...`)

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
              full_name: row.full_name ?? row.email ?? 'Client',
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

          const reportContent = await analyzeIrisDual(analysisRequest, row.language, {
            providers: clientProviders,
          })

          if ('code' in reportContent) {
            throw new Error(`Analysis failed: ${(reportContent as any).message}`)
          }

          // Language check — flag only, no retry: retrying doubled the cost of the single
          // most expensive step (dual-provider analysis + synthesis) and was the single
          // biggest avoidable contributor to runs blowing past the Vercel time ceiling.
          const languageFlagged = !detectsCorrectLanguage(
            (reportContent as ReportContent).section_1_general_terrain,
            row.language,
          )

          const finalReport = reportContent as ReportContent

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

          const updatePayload = {
            status: 'stage2_processing',
            report_id: report.id,
            stage2_started_at: new Date().toISOString(),
            ...(languageFlagged ? { language_flag: true } : {}),
          }

          const { data: claimed } = await bg
            .from('client_analyses')
            .update(updatePayload)
            .eq('report_download_token', token)
            .eq('status', 'analyzing') // guard: don't overwrite a verdict the 270s timeout already wrote
            .select('status')
            .single()

          let advanced = claimed

          if (!advanced) {
            // The 270s timeout guard may have already marked this row 'failed' before
            // this result came back — but the analysis actually succeeded and its
            // report row already exists (inserted above). Rescue it instead of
            // discarding a completed, paid analysis: retry the same update guarded
            // on 'failed' specifically, so we only ever recover from exactly this
            // race and never clobber a status we don't recognize.
            const { data: rescued } = await bg
              .from('client_analyses')
              .update({ ...updatePayload, failure_reason: null })
              .eq('report_download_token', token)
              .eq('status', 'failed')
              .select('status')
              .single()
            advanced = rescued
            if (advanced) {
              console.log(`[client-upload] token ${token} — rescued a late-arriving success after the timeout guard, resuming stage 2`)
            }
          }

          if (!advanced) {
            console.log(`[client-upload] token ${token} — arrived after the timeout guard and could not be rescued (status changed again), discarding`)
            return
          }

          console.log(`[client-upload] token ${token} — stage 1 done in ${elapsed()}, handing off to stage 2`)

          await triggerStage2(token)
        })(),
        270_000,
        'Analysis timed out after 270s',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `\x1b[31m[client-upload] token ${token} — failed after ${elapsed()}: ${msg}\x1b[0m`,
      )
      // Guard: only write 'failed' if still 'analyzing' — the un-cancelled loser promise
      // (withTimeout stops waiting, never stops the work) can still complete and write
      // 'stage2_processing' after this catch runs; without this guard a late success would
      // get silently stomped back to 'failed' with no recovery path. This is the main clobber fix.
      const { data: failClaimed } = await createAdminClient()
        .from('client_analyses')
        .update({ status: 'failed', failure_reason: msg })
        .eq('report_download_token', token)
        .eq('status', 'analyzing')
        .select('status')
        .single()
      if (!failClaimed) {
        console.log(`[client-upload] token ${token} — late failure ignored, row already progressed`)
      }
    }
  }

  waitUntil(runAnalysis())

  return NextResponse.json({ report_download_token: token })
}
