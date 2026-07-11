import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientIntakeSchema } from '@/lib/validators/client-intake'
import { generateReportToken } from '@/lib/client/report-token'
import { TIER_PRICING } from '@/types/client-analysis'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = clientIntakeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data
  const pricing = TIER_PRICING[data.payment_tier]
  const supabase = createAdminClient()

  const { data: row, error } = await supabase
    .from('client_analyses')
    .insert({
      language: data.language,
      payment_tier: data.payment_tier,
      amount: pricing.amount,
      currency: pricing.currency,
      email: data.email,
      full_name: data.full_name,
      main_complaint: data.main_complaint,
      symptom_duration: data.symptom_duration,
      current_medications: data.current_medications || null,
      date_of_birth: data.date_of_birth,
      country_of_birth: data.country_of_birth,
      city_of_birth: data.city_of_birth,
      time_of_day: data.time_of_day,
      health_questionnaire: data.health_questionnaire ?? null,
      report_download_token: generateReportToken(),
      status: 'intake_pending',
    })
    .select('id, report_download_token')
    .single()

  if (error || !row) {
    return NextResponse.json(
      { error: 'db_insert_failed', message: error?.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { id: row.id, report_download_token: row.report_download_token },
    { status: 201 },
  )
}
