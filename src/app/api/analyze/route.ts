import { createAdminClient } from '@/lib/supabase/server'
import { analyzeIris } from '@/lib/claude/analyze'
import { AnalysisRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

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
      console.log(`[analyze] session ${sessionId} — calling Claude...`)
      try {
        const result = await analyzeIris({ sessionId, patientId, rightIrisBase64, leftIrisBase64, patientData })
        if ('code' in result) {
          console.error(`\x1b[31m[analyze] session ${sessionId} — error: ${(result as any).code} ${(result as any).message}\x1b[0m`)
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
        console.log(`[analyze] session ${sessionId} — completed ✓`)
      } catch (err) {
        console.error(`\x1b[31m[analyze] session ${sessionId} — caught exception: ${err}\x1b[0m`)
        createAdminClient().from('sessions').update({ status: 'error' }).eq('id', sessionId)
      }
    }

    runAnalysis() // intentionally not awaited

    return NextResponse.json({ sessionId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 },
    )
  }
}
