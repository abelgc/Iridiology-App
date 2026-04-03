import { createAdminClient } from '@/lib/supabase/server'
import { correctionCreateSchema } from '@/lib/validators/correction'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient()
  const { id } = await params

  try {
    const { data, error } = await supabase
      .from('report_corrections')
      .select('*')
      .eq('report_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient()
  const { id: reportId } = await params

  try {
    const body = await request.json()
    const validatedData = correctionCreateSchema.parse(body)

    // Fetch report to get session and patient info
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('session_id')
      .eq('id', reportId)
      .single()

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Fetch session to get patient_id
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('patient_id')
      .eq('id', report.session_id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Insert correction
    const { data, error } = await supabase
      .from('report_corrections')
      .insert({
        report_id: reportId,
        patient_id: session.patient_id,
        section_key: validatedData.section_key,
        original_content: validatedData.original_content,
        corrected_content: validatedData.corrected_content,
        correction_notes: validatedData.correction_notes || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }
}
