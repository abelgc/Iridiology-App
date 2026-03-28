import { createClient } from '@/lib/supabase/server'
import { chatAboutReport } from '@/lib/claude/chat'
import { ChatRequest } from '@/types/claude'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = (await request.json()) as ChatRequest

    const { reportId, message, chatHistory } = body

    // Fetch report from database
    const { data: reportData, error: reportError } = await supabase
      .from('reports')
      .select('id, session_id, report_content')
      .eq('id', reportId)
      .single()

    if (reportError || !reportData) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Fetch session to get patient_id
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('patient_id')
      .eq('id', reportData.session_id)
      .single()

    if (sessionError || !sessionData) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Fetch patient data for context
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('full_name, date_of_birth, gender')
      .eq('id', sessionData.patient_id)
      .single()

    if (patientError || !patientData) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Build patient context string
    const patientContext = [
      `Name: ${patientData.full_name}`,
      patientData.date_of_birth &&
        `Age: ${new Date().getFullYear() - new Date(patientData.date_of_birth).getFullYear()} years`,
      patientData.gender && `Gender: ${patientData.gender}`,
    ]
      .filter(Boolean)
      .join('\n')

    // Stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          // Call the chat generator
          const chatGenerator = chatAboutReport(
            {
              reportId,
              message,
              chatHistory,
            },
            reportData.report_content,
            patientContext,
          )

          // Stream tokens from the generator
          for await (const token of chatGenerator) {
            send({ token })
          }

          send({ done: true })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          send({
            error: errorMessage,
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
