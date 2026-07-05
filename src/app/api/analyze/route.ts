import { createAdminClient } from '@/lib/supabase/server'
import { analyzeIrisDual } from '@/lib/claude/analyze-dual'
import { AnalysisRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'
import { enhanceEmotionalFieldWithJyotish, shouldEnhanceWithJyotish } from '@/lib/claude/enhance-emotional-field'
import { waitUntil } from '@vercel/functions'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = (await request.json()) as AnalysisRequest

    const { patientId, rightIrisBase64, leftIrisBase64, patientData } = body

    // Create session immediately
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        patient_id: patientId,
        session_date: new Date().toISOString().split('T')[0],
        analysis_mode: 'standard',
        symptoms: patientData.symptoms,
        practitioner_notes: patientData.practitioner_notes,
        status: 'analyzing',
      })
      .select()
      .single()

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 })
    }

    const sessionId = sessionData.id

    // Fire analysis in background — survives page refresh/navigation
    // Uses admin client (no cookies) since request context is gone after response
    const runAnalysis = async () => {
      const bg = createAdminClient()
      const startedAt = Date.now()
      console.log(`[analyze] session ${sessionId} — starting dual-model analysis...`)
      try {
        const result = await withTimeout(
          analyzeIrisDual({ sessionId, patientId, rightIrisBase64, leftIrisBase64, patientData }),
          280_000,
          'Analysis timed out after 280s',
        )
        if ('code' in result) {
          const msg = `${(result as any).code}: ${(result as any).message}`
          console.error(`\x1b[31m[analyze] session ${sessionId} — error: ${msg}\x1b[0m`)
          const { data: claimed } = await bg.from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
          if (!claimed) console.log(`[analyze] session ${sessionId} — terminal write skipped, status already settled`)
          return
        }

        let finalReport = result

        // Enhance emotional field with Jyotish only if there's still enough time budget left,
        // and never let it fail the session — a timeout or error here falls back to the
        // unenhanced report rather than losing the whole analysis.
        const elapsedMs = Date.now() - startedAt
        if (shouldEnhanceWithJyotish(patientData) && elapsedMs < 240_000) {
          console.log(`[analyze] session ${sessionId} — enhancing emotional field with Jyotish...`)
          try {
            finalReport = await withTimeout(
              enhanceEmotionalFieldWithJyotish(
                result,
                patientData.full_name,
                {
                  date_of_birth: patientData.date_of_birth!,
                  country_of_birth: patientData.country_of_birth!,
                  city_of_birth: patientData.city_of_birth!,
                  time_of_day: patientData.time_of_day!,
                },
              ),
              30_000,
              'jyotish_timeout',
            )
            console.log(`[analyze] session ${sessionId} — emotional field enhanced ✓`)
          } catch (jyotishErr) {
            console.error(`[analyze] session ${sessionId} — Jyotish enhancement failed, keeping unenhanced report:`, jyotishErr)
          }
        }

        const { error: reportError } = await bg
          .from('reports')
          .insert({ session_id: sessionId, report_content: finalReport, report_version: 1, is_edited: false })

        if (reportError) {
          const { data: claimed } = await bg.from('sessions').update({ status: 'error', error_message: reportError.message }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
          if (!claimed) console.log(`[analyze] session ${sessionId} — terminal write skipped, status already settled`)
          return
        }

        // Guard: only applies if status is still 'analyzing' — withTimeout never cancels the
        // underlying work, so an orphaned "loser" promise from a prior timeout could otherwise
        // land here later and silently clobber a real verdict. Accepted consequence: if the
        // timeout fired first, a late-completing inner promise leaves an orphaned `reports`
        // row on an 'error' session — we do not delete it.
        const { data: claimed } = await bg.from('sessions').update({ status: 'completed' }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
        if (!claimed) {
          console.log(`[analyze] session ${sessionId} — terminal write skipped, status already settled`)
        } else {
          console.log(`[analyze] session ${sessionId} — completed ✓`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`\x1b[31m[analyze] session ${sessionId} — caught exception: ${msg}\x1b[0m`)
        const { data: claimed } = await createAdminClient().from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
        if (!claimed) console.log(`[analyze] session ${sessionId} — terminal write skipped, status already settled`)
      }
    }

    waitUntil(runAnalysis())

    return NextResponse.json({ sessionId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 },
    )
  }
}
