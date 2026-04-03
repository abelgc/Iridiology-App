import { createAdminClient } from '@/lib/supabase/server'
import { reviewIris } from '@/lib/claude/review'
import { TechnicalReviewRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

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
        const result = await reviewIris({
          sessionId, patientId,
          rightIrisBase64, leftIrisBase64,
          practitionerInterpretation,
          patientData,
        })

        if ('code' in result) {
          await bg.from('sessions').update({ status: 'error' }).eq('id', sessionId)
          return
        }

        const { error: reportError } = await bg
          .from('reports')
          .insert({ session_id: sessionId, report_content: result, report_version: 1, is_edited: false })

        if (reportError) {
          await bg.from('sessions').update({ status: 'error' }).eq('id', sessionId)
          return
        }

        await bg.from('sessions').update({ status: 'completed' }).eq('id', sessionId)
      } catch {
        createAdminClient().from('sessions').update({ status: 'error' }).eq('id', sessionId)
      }
    }

    runAnalysis()

    return NextResponse.json({ sessionId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 },
    )
  }
}
