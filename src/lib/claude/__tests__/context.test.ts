import { describe, it, expect, vi, beforeEach } from 'vitest'

const tablesQueried: string[] = []

function chain(result: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    order: () => c,
    limit: () => c,
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown) => resolve(result),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      tablesQueried.push(table)
      return chain({ data: null, error: null })
    },
  }),
}))

import { buildPatientContext } from '../context'

beforeEach(() => {
  tablesQueried.length = 0
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
})
