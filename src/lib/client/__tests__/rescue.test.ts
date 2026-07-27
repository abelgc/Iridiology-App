import { describe, it, expect, vi, beforeEach } from 'vitest'

// Rows the mocked `select(...)` chain will hand back, and a record of every filter the
// production code applied to get them — the filters are the whole point of two of these
// tests (a too-young row and a too-old row must never be selected in the first place).
let selectedRows: any[] = []
let selectFilters: Array<{ op: string; column: string; value: unknown }> = []
let updatePayloads: any[] = []
// Every update(), with the WHERE clause it was actually issued with. The WHERE clause IS
// the compare-and-swap: `.eq('stage2_retry_count', retryCount)` is the entire mechanism
// that stops a polling browser and the cron from both claiming the same retry. A mock
// whose `eq` takes no arguments throws that away, so pointing the guard at the wrong
// column, the wrong value, or deleting it outright is invisible. Record it instead.
let updateCalls: Array<{ payload: any; filters: Array<{ column: string; value: unknown }> }> = []
let updateResults: any[] = []
let updateIndex = 0

// Helper: the filters of the Nth update, as a plain object, for readable assertions.
function whereOf(call: { filters: Array<{ column: string; value: unknown }> }) {
  return Object.fromEntries(call.filters.map((f) => [f.column, f.value]))
}

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

function updateChain(result: any, filters: Array<{ column: string; value: unknown }>): any {
  const c: any = {
    eq: (column: string, value: unknown) => {
      filters.push({ column, value })
      return c
    },
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
        const filters: Array<{ column: string; value: unknown }> = []
        updateCalls.push({ payload, filters })
        const result = updateResults[updateIndex] ?? { data: { status: 'ok' }, error: null }
        updateIndex++
        return updateChain(result, filters)
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
  updateCalls = []
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

// The WHERE clause of each update is the compare-and-swap. Without asserting on it, the
// guard can be pointed at the wrong column, pinned to a constant, or deleted outright and
// every test above still passes — verified by hand: `.eq('stage2_retry_count', 999)` in
// rescue.ts left all six green. These tests read the guard, not just the payload.
describe('sweepStaleAnalyses — the compare-and-swap itself', () => {
  it('claims the retry with a CAS on the exact row, status, and retry_count it read — not a constant', async () => {
    // retry_count deliberately 1, not 0: a mutation that pins the guard to a literal 0
    // (or any other constant) writes a WHERE that could never match this row, and a real
    // database would silently claim nothing while the sweep reports a successful retry.
    selectedRows = [stalledRow({ stage2_retry_count: 1 })]

    await sweepStaleAnalyses()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual({ stage2_retry_count: 2 })
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: '11111111-1111-4111-8111-111111111111',
      status: 'stage2_processing',
      stage2_retry_count: 1,
    })
  })

  it('guards the give-up write on the exact status AND the exact stage2_started_at it read', async () => {
    // If stage 2 quietly finished between the select and this write, the timestamp no
    // longer matches and the row keeps its real verdict instead of being stamped 'failed'
    // over a delivered report. Dropping either clause, or pinning the timestamp to
    // something like `new Date().toISOString()`, destroys that protection.
    const startedAt = agoIso(STALE_CEILING_MS + 60_000)
    selectedRows = [stalledRow({ stage2_retry_count: 2, stage2_started_at: startedAt })]

    await sweepStaleAnalyses()

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].payload).toEqual({
      status: 'failed',
      failure_reason: 'stage2_stale_after_retries',
    })
    expect(whereOf(updateCalls[0])).toEqual({
      report_download_token: '11111111-1111-4111-8111-111111111111',
      status: 'stage2_processing',
      stage2_started_at: startedAt,
    })
  })

  it('targets each stale row individually — one row per update, never another row in the batch', async () => {
    // A guard built from a loop-invariant value instead of `row` (or from the wrong row's
    // token) would have every update in the sweep point at the same record: one client
    // rescued three times, two left stuck forever.
    const tokenA = 'aaaaaaaa-1111-4111-8111-111111111111'
    const tokenB = 'bbbbbbbb-2222-4222-8222-222222222222'
    const tokenC = 'cccccccc-3333-4333-8333-333333333333'
    selectedRows = [
      stalledRow({ report_download_token: tokenA, stage2_retry_count: 0 }),
      stalledRow({ report_download_token: tokenB, stage2_retry_count: 1 }),
      stalledRow({ report_download_token: tokenC, stage2_retry_count: 2 }),
    ]

    await sweepStaleAnalyses()

    expect(updateCalls).toHaveLength(3)
    expect(whereOf(updateCalls[0])).toMatchObject({
      report_download_token: tokenA,
      stage2_retry_count: 0,
    })
    expect(whereOf(updateCalls[1])).toMatchObject({
      report_download_token: tokenB,
      stage2_retry_count: 1,
    })
    expect(whereOf(updateCalls[2])).toMatchObject({ report_download_token: tokenC })
    // ...and each triggerStage2 matches the row its own CAS claimed.
    expect(mockTriggerStage2.mock.calls.map((c) => c[0])).toEqual([tokenA, tokenB])
  })
})
