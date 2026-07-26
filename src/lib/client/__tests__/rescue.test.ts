import { describe, it, expect, vi, beforeEach } from 'vitest'

// Rows the mocked `select(...)` chain will hand back, and a record of every filter the
// production code applied to get them — the filters are the whole point of two of these
// tests (a too-young row and a too-old row must never be selected in the first place).
let selectedRows: any[] = []
let selectFilters: Array<{ op: string; column: string; value: unknown }> = []
let updatePayloads: any[] = []
let updateResults: any[] = []
let updateIndex = 0

function queryChain(rows: any[]): any {
  const c: any = {
    select: () => c,
    eq: (column: string, value: unknown) => {
      selectFilters.push({ op: 'eq', column, value })
      return c
    },
    lt: (column: string, value: unknown) => {
      selectFilters.push({ op: 'lt', column, value })
      return c
    },
    gt: (column: string, value: unknown) => {
      selectFilters.push({ op: 'gt', column, value })
      return c
    },
    // Supabase query builders are thenables — awaiting one runs it.
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  }
  return c
}

function updateChain(result: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(result),
  }
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => queryChain(selectedRows),
      update: (payload: any) => {
        updatePayloads.push(payload)
        const result = updateResults[updateIndex] ?? { data: { status: 'ok' }, error: null }
        updateIndex++
        return updateChain(result)
      },
    }),
  }),
}))

const mockTriggerStage2 = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/client/trigger-stage2', () => ({
  triggerStage2: (token: string) => mockTriggerStage2(token),
}))

import { sweepStaleAnalyses, STALE_CEILING_MS, SWEEP_MAX_AGE_MS } from '../rescue'

const NOW = Date.now()
const agoIso = (ms: number) => new Date(NOW - ms).toISOString()

function stalledRow(overrides: Record<string, unknown> = {}) {
  return {
    report_download_token: '11111111-1111-4111-8111-111111111111',
    status: 'stage2_processing',
    stage2_started_at: agoIso(STALE_CEILING_MS + 60_000),
    stage2_retry_count: 0,
    ...overrides,
  }
}

beforeEach(() => {
  selectedRows = []
  selectFilters = []
  updatePayloads = []
  updateResults = []
  updateIndex = 0
  mockTriggerStage2.mockReset().mockResolvedValue(undefined)
})

describe('sweepStaleAnalyses', () => {
  it('retries a stage-2 run that has been stalled past the ceiling', async () => {
    selectedRows = [stalledRow()]

    const result = await sweepStaleAnalyses()

    expect(mockTriggerStage2).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(updatePayloads[0]).toEqual({ stage2_retry_count: 1 })
    expect(result).toEqual({ scanned: 1, retried: 1, failed: 0 })
  })

  it('only ever asks for rows in the window "stuck but still recent" — never younger than the ceiling, never older than a day', async () => {
    selectedRows = []
    await sweepStaleAnalyses()

    expect(selectFilters).toContainEqual({ op: 'eq', column: 'status', value: 'stage2_processing' })

    // Upper bound: a run younger than the ceiling is still legitimately working.
    const upper = selectFilters.find((f) => f.op === 'lt' && f.column === 'stage2_started_at')
    expect(upper).toBeDefined()
    const upperAgeMs = NOW - new Date(upper!.value as string).getTime()
    expect(upperAgeMs).toBeGreaterThanOrEqual(STALE_CEILING_MS - 5_000)
    expect(upperAgeMs).toBeLessThanOrEqual(STALE_CEILING_MS + 5_000)

    // Lower bound: the guard that stops the very first cron run from re-running every
    // corpse in the table at once, at full AI cost, for clients who left days ago.
    const lower = selectFilters.find((f) => f.op === 'gt' && f.column === 'stage2_started_at')
    expect(lower).toBeDefined()
    const lowerAgeMs = NOW - new Date(lower!.value as string).getTime()
    expect(lowerAgeMs).toBeGreaterThanOrEqual(SWEEP_MAX_AGE_MS - 5_000)
    expect(lowerAgeMs).toBeLessThanOrEqual(SWEEP_MAX_AGE_MS + 5_000)
  })

  it('gives up on a row that has already used both retries, and never triggers stage 2 again for it', async () => {
    selectedRows = [stalledRow({ stage2_retry_count: 2 })]

    const result = await sweepStaleAnalyses()

    expect(updatePayloads[0]).toEqual({
      status: 'failed',
      failure_reason: 'stage2_stale_after_retries',
    })
    expect(mockTriggerStage2).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 1, retried: 0, failed: 1 })
  })

  it('does not count a retry it lost the race for — a polling browser got there first', async () => {
    selectedRows = [stalledRow()]
    // The CAS update matches no row: another caller already incremented retry_count.
    updateResults = [{ data: null, error: null }]

    const result = await sweepStaleAnalyses()

    expect(mockTriggerStage2).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 1, retried: 0, failed: 0 })
  })

  it('sweeps every stale row in one pass, not just the first', async () => {
    selectedRows = [
      stalledRow({ report_download_token: 'aaaaaaaa-1111-4111-8111-111111111111' }),
      stalledRow({ report_download_token: 'bbbbbbbb-2222-4222-8222-222222222222' }),
      stalledRow({ report_download_token: 'cccccccc-3333-4333-8333-333333333333', stage2_retry_count: 2 }),
    ]

    const result = await sweepStaleAnalyses()

    expect(mockTriggerStage2).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ scanned: 3, retried: 2, failed: 1 })
  })

  it('returns a clean zero result when nothing is stuck', async () => {
    selectedRows = []

    const result = await sweepStaleAnalyses()

    expect(result).toEqual({ scanned: 0, retried: 0, failed: 0 })
    expect(mockTriggerStage2).not.toHaveBeenCalled()
  })
})
