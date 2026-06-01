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
      try {
        const result = await withTimeout(
          compareIris({
            sessionId, patientId,
            previousRightIrisBase64, previousLeftIrisBase64,
            rightIrisBase64, leftIrisBase64,
            previousSessionDate: '',
            patientData,
          }),
          250_000,
          'Analysis timed out after 250s',
        )

        if ('code' in result) {
          const msg = `${(result as any).code}: ${(result as any).message}`
          await bg.from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId)
          return
        }

        const { error: reportError } = await bg
          .from('reports')
          .insert({ session_id: sessionId, report_content: result, report_version: 1, is_edited: false })

        if (reportError) {
          await bg.from('sessions').update({ status: 'error', error_message: reportError.message }).eq('id', sessionId)
          return
        }

        await bg.from('sessions').update({ status: 'completed' }).eq('id', sessionId)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await createAdminClient().from('sessions').update({ status: 'error', error_message: msg }).eq('id', sessionId)
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
