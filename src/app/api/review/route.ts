import { createAdminClient } from '@/lib/supabase/server'
import { reviewIris } from '@/lib/claude/review'
import { TechnicalReviewRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { withTimeout } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  try {
    const body = (await request.json()) as TechnicalReviewRequest

    const { patientId, rightIrisBase64, leftIrisBase64, practitionerInterpretation, patientData } = body

    if (!practitionerInterpretation?.trim()) {
      return NextResponse.json(
        { message: 'Practitioner interpretation is required for technical review' },
        { status: 400 },
      )
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        patient_id: patientId,
        session_date: new Date().toISOString().split('T')[0],
        analysis_mode: 'technical_review',
        symptoms: patientData.symptoms,
        practitioner_notes: patientData.practitioner_notes,
        practitioner_interpretation: practitionerInterpretation,
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
          reviewIris({
            sessionId, patientId,
            rightIrisBase64, leftIrisBase64,
            practitionerInterpretation,
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
