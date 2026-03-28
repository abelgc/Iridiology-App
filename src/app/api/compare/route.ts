import { createClient } from '@/lib/supabase/server'
import { compareIris } from '@/lib/claude/compare'
import { ComparisonRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = (await request.json()) as ComparisonRequest & { sessionId?: string }

    const {
      patientId,
      previousRightIrisBase64,
      previousLeftIrisBase64,
      rightIrisBase64,
      leftIrisBase64,
      patientData,
    } = body

    // Validate that we have exactly 4 images
    if (!previousRightIrisBase64 || !previousLeftIrisBase64 || !rightIrisBase64 || !leftIrisBase64) {
      return NextResponse.json(
        { message: 'All four iris images are required for comparison analysis' },
        { status: 400 }
      )
    }

    // Create a session
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
          const comparisonRequest: ComparisonRequest = {
            sessionId,
            patientId,
            previousRightIrisBase64,
            previousLeftIrisBase64,
            rightIrisBase64,
            leftIrisBase64,
            previousSessionDate: '', // Could be fetched from previous session
            patientData,
          }

          const result = await compareIris(comparisonRequest)

          if ('code' in result) {
            // Error from Claude
            await supabase.from('sessions').update({ status: 'error' }).eq('id', sessionId)

            send({
              status: 'error',
              message: (result as any).message || 'Comparison analysis failed',
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
