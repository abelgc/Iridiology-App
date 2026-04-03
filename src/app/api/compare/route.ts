import { createAdminClient } from '@/lib/supabase/server'
import { compareIris } from '@/lib/claude/compare'
import { ComparisonRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

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
        const result = await compareIris({
          sessionId, patientId,
          previousRightIrisBase64, previousLeftIrisBase64,
          rightIrisBase64, leftIrisBase64,
          previousSessionDate: '',
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
