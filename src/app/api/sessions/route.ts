import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const patientId = request.nextUrl.searchParams.get('patientId')

  try {
    let query = supabase
      .from('sessions')
      .select(
        `
        id,
        patient_id,
        created_at,
        session_date,
        analysis_mode,
        status,
        symptoms,
        practitioner_notes,
        patients:patient_id (
          full_name
        )
      `
      )
      .order('created_at', { ascending: false })

    if (patientId) {
      query = query.eq('patient_id', patientId)
    }

    const { data, error } = await query

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

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()

    const { patient_id, session_date, analysis_mode, symptoms, practitioner_notes } = body

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        patient_id,
        session_date: session_date || new Date().toISOString().split('T')[0],
        analysis_mode,
        symptoms: symptoms || null,
        practitioner_notes: practitioner_notes || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
