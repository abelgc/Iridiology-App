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

function updateChain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}
const updateMock = vi.fn()

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
        const result = updateCallResults[updateCallIndex] ?? {
          data: { report_download_token: 'x' },
          error: null,
        }
        updateCallIndex++
        return updateChain(result)
      },
    }),
  }),
}))

beforeEach(() => {
  selectResults = []
  selectCallIndex = 0
  updateCallResults = []
  updateCallIndex = 0
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
