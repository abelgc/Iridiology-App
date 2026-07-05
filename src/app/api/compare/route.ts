import { createAdminClient } from '@/lib/supabase/server'
import { compareIris } from '@/lib/claude/compare'
import { ComparisonRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = (await request.json()) as ComparisonRequest

    const { patientId, previousRightIrisBase64, previousLeftIrisBase64, rightIrisBase64, leftIrisBase64, patientData } = body

    if (!previousRightIrisBase64 || !previousLeftIrisBase64 || !rightIrisBase64 || !leftIrisBase64) {
      return NextResponse.json(
        { message: 'All four iris images are required for comparison analysis' },
        { status: 400 },
      )
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        patient_id: patientId,
        session_date: new Date().toISOString().split('T')[0],
        analysis_mode: 'comparison',
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

    const runAnalysis = async () => {
      const bg = createAdminClient()
      const startedAt = Date.now()
      const elapsed = () => `${Math.round((Date.now() - startedAt) / 1000)}s`
      console.log(`[compare] session ${sessionId} — starting comparison analysis...`)
      try {
        const result = await withTimeout(
          compareIris({
            sessionId, patientId,
            previousRightIrisBase64, previousLeftIrisBase64,
            rightIrisBase64, leftIrisBase64,
            previousSessionDate: '',
            patientData,
          }),
          285_000,
          'Analysis timed out after 285s',
        )

        if ('code' in result) {
          const msg = `${(result as any).code}: ${(result as any).message}`
          console.error(`\x1b[31m[compare] session ${sessionId} — error after ${elapsed()}: ${msg}\x1b[0m`)
          const { data: claimed } = await bg.from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
          if (!claimed) console.log(`[compare] session ${sessionId} — terminal write skipped, status already settled`)
          return
        }

        const { error: reportError } = await bg
          .from('reports')
          .insert({ session_id: sessionId, report_content: result, report_version: 1, is_edited: false })

        if (reportError) {
          console.error(`\x1b[31m[compare] session ${sessionId} — report insert failed after ${elapsed()}: ${reportError.message}\x1b[0m`)
          const { data: claimed } = await bg.from('sessions').update({ status: 'error', error_message: reportError.message }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
          if (!claimed) console.log(`[compare] session ${sessionId} — terminal write skipped, status already settled`)
          return
        }

        // Guard: only applies if status is still 'analyzing' — withTimeout never cancels the
        // underlying work, so an orphaned "loser" promise from a prior timeout could otherwise
        // land here later and silently clobber a real verdict. Accepted consequence: if the
        // timeout fired first, a late-completing inner promise leaves an orphaned `reports`
        // row on an 'error' session — we do not delete it.
        const { data: claimed } = await bg.from('sessions').update({ status: 'completed' }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
        if (!claimed) {
          console.log(`[compare] session ${sessionId} — terminal write skipped, status already settled`)
        } else {
          console.log(`[compare] session ${sessionId} — completed in ${elapsed()} ✓`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`\x1b[31m[compare] session ${sessionId} — caught exception after ${elapsed()}: ${msg}\x1b[0m`)
        const { data: claimed } = await createAdminClient().from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId).eq('status', 'analyzing').select('status').single()
        if (!claimed) console.log(`[compare] session ${sessionId} — terminal write skipped, status already settled`)
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
