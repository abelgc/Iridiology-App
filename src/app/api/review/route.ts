import { createClient } from '@/lib/supabase/server'
import { reviewIris } from '@/lib/claude/review'
import { TechnicalReviewRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = (await request.json()) as TechnicalReviewRequest

    const { patientId, rightIrisBase64, leftIrisBase64, practitionerInterpretation, patientData } =
      body

    // Validate practitioner interpretation is provided
    if (!practitionerInterpretation || !practitionerInterpretation.trim()) {
      return NextResponse.json(
        { message: 'Practitioner interpretation is required for technical review' },
        { status: 400 }
      )
    }

    // Create a session
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

    // Stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Send initial status
          send({ status: 'analyzing', step: 'Sending images to AI...' })

          // Call Claude API
          const reviewRequest: TechnicalReviewRequest = {
            sessionId,
            patientId,
            rightIrisBase64,
            leftIrisBase64,
            practitionerInterpretation,
            patientData,
          }

          const result = await reviewIris(reviewRequest)

          if ('code' in result) {
            // Error from Claude
            await supabase.from('sessions').update({ status: 'error' }).eq('id', sessionId)

            send({
              status: 'error',
              message: (result as any).message || 'Technical review failed',
            })
          } else {
            // Success
            send({ status: 'analyzing', step: 'Generating report...' })

            // Save report to database
            const { data: reportData, error: reportError } = await supabase
              .from('reports')
              .insert({
                session_id: sessionId,
                report_content: result,
                report_version: 1,
                is_edited: false,
              })
              .select()
              .single()

            if (reportError) {
              await supabase.from('sessions').update({ status: 'error' }).eq('id', sessionId)

              send({
                status: 'error',
                message: 'Failed to save report',
              })
            } else {
              // Update session status to completed
              await supabase
                .from('sessions')
                .update({ status: 'completed' })
                .eq('id', sessionId)

              send({
                status: 'complete',
                reportId: reportData.id,
              })
            }
          }
        } catch (error) {
          await supabase.from('sessions').update({ status: 'error' }).eq('id', sessionId)

          send({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}
