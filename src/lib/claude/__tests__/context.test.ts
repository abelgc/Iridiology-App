import { describe, it, expect, vi, beforeEach } from 'vitest'

const tablesQueried: string[] = []
const limitCalls: number[] = []
let correctionsResult: unknown = { data: null, error: null }

function chain(result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    order: () => c,
    limit: (n: number) => {
      limitCalls.push(n)
      return c
    },
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tablesQueried.push(table)
      if (table === 'report_corrections') return chain(correctionsResult)
      return chain({ data: null, error: null })
    },
  }),
}))

import { buildPatientContext } from '../context'

beforeEach(() => {
  tablesQueried.length = 0
  limitCalls.length = 0
  correctionsResult = { data: null, error: null }
})

describe('buildPatientContext', () => {
  it('REGRESSION (2026-07-27): queries nothing when there is no patient, instead of sending an empty string to a uuid column', async () => {
    // Client-funnel analyses have no patient record — upload/route.ts passes ''. Postgres
    // rejected that with `invalid input syntax for type uuid: ""` twice on every single
    // analysis, silently, because both callers discard the error. Two false errors on
    // every run make the real ones harder to see.
    const context = await buildPatientContext('')

    expect(tablesQueried).toEqual([])
    expect(context).toEqual({ previousReportSummary: null, practitionerCorrections: null })
  })

  it('ignores a whitespace-only id for the same reason', async () => {
    await buildPatientContext('   ')
    expect(tablesQueried).toEqual([])
  })

  it('still queries for a real patient, so practitioner history keeps working', async () => {
    await buildPatientContext('f6aa7c30-70c0-43c0-8e61-f8d5a72a3094')

    expect(tablesQueried).toContain('sessions')
    expect(tablesQueried).toContain('report_corrections')
  })

  it('REGRESSION: caps prior corrections at 10, matching the "up to 10 prior corrections" contract the analysis prompt is built around', async () => {
    await buildPatientContext('f6aa7c30-70c0-43c0-8e61-f8d5a72a3094')

    expect(limitCalls).toContain(10)
  })

  it('formats each correction as "Section <key>: <content> (Practitioner note: <notes>)", joined with a blank line, newest first per the query order', async () => {
    correctionsResult = {
      data: [
        { section_key: 'section_7_hepatic', corrected_content: 'Severe hepatic congestion.', correction_notes: 'confirmed by patient fatigue' },
        { section_key: 'section_8_digestive_intestinal', corrected_content: 'Mild digestive weakness.', correction_notes: null },
      ],
      error: null,
    }

    const context = await buildPatientContext('f6aa7c30-70c0-43c0-8e61-f8d5a72a3094')

    expect(context.practitionerCorrections).toBe(
      'Section section_7_hepatic: Severe hepatic congestion. (Practitioner note: confirmed by patient fatigue)\n\n' +
      'Section section_8_digestive_intestinal: Mild digestive weakness.'
    )
  })

  it('returns null practitionerCorrections when the query errors, instead of throwing or leaking the error object into the prompt', async () => {
    correctionsResult = { data: null, error: { message: 'db down' } }

    const context = await buildPatientContext('f6aa7c30-70c0-43c0-8e61-f8d5a72a3094')

    expect(context.practitionerCorrections).toBeNull()
  })
})
