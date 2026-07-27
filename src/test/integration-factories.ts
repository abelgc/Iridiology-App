import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

// A second, independent copy of the localhost guard from integration-setup.ts. That one runs
// once per worker at setup; this one runs on every single client construction. Anything that
// imports this module gets a client that physically cannot point at production.
function assertLocal(url: string) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
    throw new Error(`refusing to build a test Supabase client for "${url}" — localhost only`)
  }
}

let cached: SupabaseClient | null = null

/** Service-role client against the LOCAL stack. Same key the app's createAdminClient() uses. */
export function testDb(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  assertLocal(url)
  cached = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

/** A 13-section report body, the shape rewriteReportForClient / the PDF renderer expect. */
export function reportContentFixture(overrides: Record<string, unknown> = {}) {
  return {
    section_1_general_terrain: 'general terrain',
    section_2_emotional_field: 'emotional field',
    section_3_cognitive_nervous: 'cognitive nervous',
    section_4_immune_lymphatic: 'immune lymphatic',
    section_5_endocrine_hormonal: 'endocrine hormonal',
    section_6_circulatory_cardiorespiratory: 'circulatory',
    section_7_hepatic: 'hepatic',
    section_8_digestive_intestinal: 'digestive',
    section_9_renal_urinary: 'renal',
    section_10_structural_integumentary: 'structural',
    section_11_detected_axes: 'axes',
    section_12_conclusion: 'conclusion',
    section_13_strengths_of_the_body: 'strengths',
    ...overrides,
  }
}

export type AnalysisOverrides = Partial<{
  status: string
  payment_tier: string
  amount: number
  currency: string
  language: string
  email: string | null
  full_name: string | null
  report_id: string | null
  report_download_token: string
  analyzing_started_at: string | null
  stage2_started_at: string | null
  stage2_retry_count: number
  report_delivered_at: string | null
  failure_reason: string | null
  date_of_birth: string | null
  country_of_birth: string | null
  city_of_birth: string | null
  time_of_day: string | null
  main_complaint: string | null
  current_medications: string | null
  health_questionnaire: Record<string, unknown> | null
}>

/**
 * Insert one real client_analyses row and hand back exactly what the database stored.
 *
 * Every call gets a fresh UUID token, so tests never collide on the UNIQUE constraint even
 * when the table is left dirty. `amount` and `payment_tier` are NOT NULL in production with
 * no default, so they are supplied here rather than left to the caller to remember.
 */
export async function seedAnalysis(overrides: AnalysisOverrides = {}) {
  const { data, error } = await testDb()
    .from('client_analyses')
    .insert({
      payment_tier: 'basic_1990',
      amount: 19.9,
      currency: 'EUR',
      language: 'es',
      status: 'paid',
      report_download_token: randomUUID(),
      ...overrides,
    })
    .select('*')
    .single()

  if (error) throw new Error(`seedAnalysis failed: ${error.message}`)
  return data as Record<string, any>
}

/** Insert a reports row (session_id stays null — that is what the client pipeline does). */
export async function seedReport(content: Record<string, unknown> = reportContentFixture()) {
  const { data, error } = await testDb()
    .from('reports')
    .insert({ report_content: content, report_version: 1, is_edited: false })
    .select('*')
    .single()

  if (error) throw new Error(`seedReport failed: ${error.message}`)
  return data as Record<string, any>
}

/** Re-read a row from the database. Never trust the value a mutation returned. */
export async function readAnalysis(token: string) {
  const { data, error } = await testDb()
    .from('client_analyses')
    .select('*')
    .eq('report_download_token', token)
    .single()
  if (error) throw new Error(`readAnalysis failed: ${error.message}`)
  return data as Record<string, any>
}

export async function readEmailLog(analysisId: string) {
  const { data } = await testDb()
    .from('email_send_log')
    .select('*')
    .eq('analysis_id', analysisId)
    .maybeSingle()
  return data as Record<string, any> | null
}

const ALL_ROWS = '00000000-0000-0000-0000-000000000000'

/**
 * Wipe the tables these tests touch.
 *
 * sweepStaleAnalyses() has no notion of "my rows" — it scans the entire client_analyses
 * table. A leftover stale row from a previous test would be swept by the next one and the
 * scanned/retried counts would stop meaning anything. So this runs before every test, not
 * just at the end.
 *
 * Order matters: email_send_log references client_analyses, client_analyses references
 * reports.
 */
export async function resetDb() {
  const db = testDb()
  for (const table of ['email_send_log', 'client_analyses', 'reports']) {
    const { error } = await db.from(table).delete().neq('id', ALL_ROWS)
    if (error) throw new Error(`resetDb(${table}) failed: ${error.message}`)
  }
}

/** ISO timestamp `minutes` in the past. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}
