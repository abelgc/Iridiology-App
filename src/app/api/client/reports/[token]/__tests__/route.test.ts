import { describe, it, expect, vi, beforeEach } from 'vitest'

const triggerStage2Mock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/client/trigger-stage2', () => ({ triggerStage2: triggerStage2Mock }))

let currentRow: Record<string, unknown> = {
  report_download_token: '00000000-0000-4000-8000-000000000000',
  language: 'es',
  status: 'completed',
  report_id: 'r1',
  reports: { id: 'r1', report_content: { section_1_general_terrain: 'x' } },
}

// Per-call-index override lists. Missing/undefined entries fall back to a default:
// selects fall back to `currentRow`; updates fall back to a truthy "claimed" result.
let selectResults: any[] = []
let selectCallIndex = 0
let updateCallResults: any[] = []
let updateCallIndex = 0

function updateChain(finalResult: any, filters: Array<{ column: string; value: unknown }>): any {
  const c: any = {
    eq: (column: string, value: unknown) => {
      filters.push({ column, value })
      return c
    },
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}
const updateMock = vi.fn()
// Every update(), paired with the WHERE clause it was issued with. All three writes in
// this route are compare-and-swaps against a value read moments earlier — the status AND
// the exact timestamp, or the exact retry_count. Those clauses are the only thing that
// distinguishes "this row is genuinely still stuck" from "stage 2 finished under us";
// an `eq` that records nothing hides every way of getting them wrong.
type UpdateCall = { payload: any; filters: Array<{ column: string; value: unknown }> }
let updateCalls: UpdateCall[] = []
const whereOf = (call: UpdateCall) =>
  Object.fromEntries(call.filters.map((f) => [f.column, f.value]))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => {
            const result = selectResults[selectCallIndex] ?? { data: currentRow, error: null }
            selectCallIndex++
            return Promise.resolve(result)
          },
        }),
      }),
      update: (...args: unknown[]) => {
        updateMock(...args)
        const filters: Array<{ column: string; value: unknown }> = []
        updateCalls.push({ payload: args[0], filters })
        const result = updateCallResults[updateCallIndex] ?? {
          data: { report_download_token: 'x' },
          error: null,
        }
        updateCallIndex++
        return updateChain(result, filters)
      },
    }),
  }),
}))

beforeEach(() => {
  selectResults = []
  selectCallIndex = 0
  updateCallResults = []
  updateCallIndex = 0
  updateCalls = []
  updateMock.mockClear()
  triggerStage2Mock.mockClear()
})

describe('GET /api/client/reports/[token]', () => {
  it('returns report content for valid token', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000000' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report.section_1_general_terrain).toBe('x')
    expect(json.language).toBe('es')
  })

  it('returns 400 for invalid token format', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: 'bad' }),
    } as never)
    expect(res.status).toBe(400)
  })

  it('treats a stale "analyzing" row (older than the 290s ceiling) as failed', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000001',
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: new Date(Date.now() - 300_000).toISOString(),
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000001' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('failed')
  })

  it('keeps polling a fresh "analyzing" row (within the ceiling)', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000002',
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: new Date(Date.now() - 5_000).toISOString(),
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000002' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('analyzing')
  })

  it('re-reads and falls through to the completed report when the analyzing-stale CAS loses the race', async () => {
    // The row looks stale-'analyzing' on the first read, but by the time the guarded 'failed'
    // write runs, stage 1 has actually finished — the write loses its CAS (0 rows), so instead
    // of telling the client "failed" we re-read and serve the fresh, completed state.
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000006',
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: new Date(Date.now() - 300_000).toISOString(),
      reports: null,
    }
    const freshRow = {
      report_download_token: '00000000-0000-4000-8000-000000000006',
      language: 'en',
      status: 'completed',
      report_id: 'rX',
      payment_tier: 'basic_1990',
      report_delivered_at: new Date().toISOString(),
      reports: { id: 'rX', report_content: { section_1_general_terrain: 'done' }, client_report_content: null },
    }
    selectResults = [undefined, { data: freshRow, error: null }]
    updateCallResults = [{ data: null, error: null }]

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000006' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report.section_1_general_terrain).toBe('done')
  })

  it('retries stage 2 (bounded) when stage2_processing is stale and under the retry limit', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000003',
      language: 'en',
      status: 'stage2_processing',
      report_id: 'r3',
      stage2_started_at: new Date(Date.now() - 300_000).toISOString(),
      stage2_retry_count: 0,
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000003' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('stage2_processing')
    expect(triggerStage2Mock).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000003')
  })

  it('does not call triggerStage2 when the retry-count CAS loses the race (another poller already retried)', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000005',
      language: 'en',
      status: 'stage2_processing',
      report_id: 'r5',
      stage2_started_at: new Date(Date.now() - 300_000).toISOString(),
      stage2_retry_count: 0,
      reports: null,
    }
    updateCallResults = [{ data: null, error: null }] // the retry-count CAS loses
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000005' }),
    } as never)
    expect(res.status).toBe(409)
    expect(triggerStage2Mock).not.toHaveBeenCalled()
  })

  it('gives up and marks stage 2 failed after exhausting retries', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000004',
      language: 'en',
      status: 'stage2_processing',
      report_id: 'r4',
      stage2_started_at: new Date(Date.now() - 300_000).toISOString(),
      stage2_retry_count: 2,
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000004' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('failed')
    expect(triggerStage2Mock).not.toHaveBeenCalled()
  })
})

describe('a finished report is never held hostage by its status', () => {
  const TOK = '00000000-0000-4000-8000-0000000000ff'
  const fila = (extra: Record<string, unknown>) => ({
    data: {
      report_download_token: TOK,
      language: 'es',
      status: 'failed',
      payment_tier: 'basic_1990',
      report_delivered_at: null,
      report_id: null,
      analyzing_started_at: null,
      stage2_started_at: null,
      stage2_retry_count: 0,
      reports: null,
      ...extra,
    },
    error: null,
  })

  it('REGRESSION (2026-07-27): serves a report whose content exists even if the row is marked failed', async () => {
    // Production holds a row from 2026-07-07 with client_report_content AND
    // report_delivered_at set — the report was written and delivered — while its status
    // says 'failed'. The gate demanded 'completed', so a finished report was unreachable
    // forever because of a label that lost a race.
    selectResults = [fila({
      report_id: 'rep-1',
      report_delivered_at: '2026-07-07T15:23:49.291Z',
      reports: { id: 'rep-1', report_content: {}, client_report_content: { section_1_general_terrain: 'Tu cuerpo...' } },
    })]

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: TOK }),
    } as never)

    expect(res.status).toBe(200)
  })

  it('still refuses a failed row with no content, so a real failure is not dressed up as a report', async () => {
    selectResults = [fila({})]

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: TOK }),
    } as never)

    expect(res.status).toBe(409)
  })

  // The test above cannot tell WHICH clause refused the row: its fixture is both
  // status:'failed' AND report_delivered_at:null, so the status clause alone already
  // returns 409 and the no-content clause is never the deciding factor. Deleting `!report`
  // from the gate leaves it green — while a delivered row with no content would be served
  // as `report: null`, and the client's viewer would render an empty paid report.
  // These fixtures satisfy the status/delivery half of the gate, so only `!report` is left
  // standing between the client and a blank report.
  it.each([
    ['a DELIVERED row whose report row is missing entirely', { status: 'failed', report_delivered_at: '2026-07-07T15:23:49.291Z', reports: null }],
    ['a DELIVERED row whose report row exists but is empty', { status: 'failed', report_delivered_at: '2026-07-07T15:23:49.291Z', reports: { id: 'rep-1', report_content: null, client_report_content: null } }],
    ['a COMPLETED row with no content at all', { status: 'completed', report_delivered_at: null, reports: null }],
  ])('refuses %s — content decides, and there is none', async (_label, extra) => {
    selectResults = [fila(extra)]

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: TOK }),
    } as never)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('not_ready')
    expect(json.report).toBeUndefined()
  })
})

// Each guarded write below is a compare-and-swap on values read moments earlier. The tests
// above prove what happens when a CAS wins or loses; none of them proved what the CAS
// actually compares. Pointing it at `new Date()` instead of the timestamp that was read,
// or pinning retry_count to a literal, means the guard can never match in production —
// the row is left stuck forever while the route reports it handled things.
describe('GET /api/client/reports/[token] — the compare-and-swaps themselves', () => {
  it('marks a stale "analyzing" row failed only on the exact status AND the exact analyzing_started_at it read', async () => {
    const startedAt = new Date(Date.now() - 300_000).toISOString()
    const token = '00000000-0000-4000-8000-0000000000a1'
    currentRow = {
      report_download_token: token,
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: startedAt,
      reports: null,
    }

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    await GET(new Request('http://test') as never, { params: Promise.resolve({ token }) } as never)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual({
      status: 'failed',
      failure_reason: 'stale_timeout_synthesized',
    })
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: token,
      status: 'analyzing',
      analyzing_started_at: startedAt,
    })
  })

  it('gives up on stage 2 only on the exact status AND the exact stage2_started_at it read', async () => {
    const startedAt = new Date(Date.now() - 300_000).toISOString()
    const token = '00000000-0000-4000-8000-0000000000a2'
    currentRow = {
      report_download_token: token,
      language: 'en',
      status: 'stage2_processing',
      report_id: 'r4',
      stage2_started_at: startedAt,
      stage2_retry_count: 2,
      reports: null,
    }

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    await GET(new Request('http://test') as never, { params: Promise.resolve({ token }) } as never)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual({
      status: 'failed',
      failure_reason: 'stage2_stale_after_retries',
    })
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: token,
      status: 'stage2_processing',
      stage2_started_at: startedAt,
    })
  })

  it('claims the stage-2 retry with a CAS on the exact retry_count it read — not a constant', async () => {
    // retry_count is deliberately 1, not 0: a guard pinned to a literal 0 (or any other
    // constant) writes a WHERE that could never match this row, so two tabs polling the
    // same stale analysis would both "win", both increment, and both re-run the whole of
    // stage 2 — the double-run this CAS exists to prevent.
    const token = '00000000-0000-4000-8000-0000000000a3'
    currentRow = {
      report_download_token: token,
      language: 'en',
      status: 'stage2_processing',
      report_id: 'r3',
      stage2_started_at: new Date(Date.now() - 300_000).toISOString(),
      stage2_retry_count: 1,
      reports: null,
    }

    const { GET } = await import('@/app/api/client/reports/[token]/route')
    await GET(new Request('http://test') as never, { params: Promise.resolve({ token }) } as never)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual({ stage2_retry_count: 2 })
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: token,
      status: 'stage2_processing',
      stage2_retry_count: 1,
    })
    expect(triggerStage2Mock).toHaveBeenCalledWith(token)
  })
})
