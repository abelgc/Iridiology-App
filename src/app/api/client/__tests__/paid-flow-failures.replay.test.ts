// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'

// What the client sees when a model call fails the way real calls failed, end to end through
// the upload route, stage 1, the stage-2 route and the report endpoint the client polls.
// Every reply is either a real recording (src/test/ai-replay/recordings) or a provider error
// in the provider's own wire format; the SDKs, the retries and the routes are production code.
// The invariant under every failure: the client gets the complete report or a failed status,
// never a partial or raw report, and paid calls are bounded.

vi.mock('@/lib/supabase/server', async () => (await import('@/test/ai-replay/client-pipeline')).supabaseServerMock())
vi.mock('@vercel/functions', async () => (await import('@/test/ai-replay/client-pipeline')).vercelFunctionsMock())

import { runClientPipeline, deliveredReport, type ClientRun } from '@/test/ai-replay/client-pipeline'
import { recording } from '@/test/ai-replay/recordings'
import {
  claudeLegRestart,
  creditBalanceTooLow,
  hang,
  jsonThenMarkdown,
  openaiServerError,
  overloaded,
  writerAInvalidJson,
} from '@/test/ai-replay/failures'
import { DEFAULT_SET } from '@/test/ai-replay/recordings'
import { REPORT_SECTION_KEYS } from '@/types/report'

const STAGE2_STALE_MS = 291_000

// The first run pays for loading the route modules; under a full parallel `npm test` that alone
// can pass the default 5s.
vi.setConfig({ testTimeout: 30_000 })

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function quiet() {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

function expectCompleteReport(run: ClientRun) {
  expect(run.clientView.status, `the client did not get a report:\n${run.explain()}`).toBe(200)
  const report = deliveredReport(run.clientView)!
  for (const key of REPORT_SECTION_KEYS) expect(report[key]?.trim().length ?? 0, `${key}\n${run.explain()}`).toBeGreaterThan(40)
  expect(run.row.status).toBe('completed')
}

function expectFailedWithoutReport(run: ClientRun, reason: RegExp) {
  expect(run.clientView, run.explain()).toEqual({ status: 409, body: { error: 'not_ready', status: 'failed' } })
  expect(String(run.row.failure_reason), run.explain()).toMatch(reason)
}

function count(run: ClientRun, role: string) {
  return run.calls.filter((c) => c.role === role).length
}

describe('provider errors', () => {
  it('credit balance too low on the Claude leg: failed at once with billing_or_auth_error, no stage 2, one Claude call', async () => {
    quiet()
    const run = await runClientPipeline({ lang: 'es', script: { 'claude-leg': creditBalanceTooLow() } })
    expectFailedWithoutReport(run, /billing_or_auth_error.*credit balance is too low/)
    expect(count(run, 'claude-leg')).toBe(1)
    expect(run.calls.some((c) => c.role === 'planner' || c.role === 'synthesis')).toBe(false)
    expect(run.db.tables.reports ?? []).toEqual([])
  })

  it('credit balance too low on the Planner: stage 2 fails fast with billing_or_auth_error, no Writer is paid for', async () => {
    quiet()
    const run = await runClientPipeline({ lang: 'de', script: { planner: creditBalanceTooLow() } })
    expectFailedWithoutReport(run, /^billing_or_auth_error: .*credit balance is too low/)
    expect(count(run, 'planner')).toBe(1)
    expect(run.calls.some((c) => c.role?.startsWith('writer-'))).toBe(false)
  })

  it('Anthropic 529 overloaded twice on the Planner, then a real reply: the client still gets the report', async () => {
    quiet()
    vi.useFakeTimers()
    const run = await runClientPipeline({
      lang: 'en',
      script: { planner: [overloaded(), overloaded(), recording(DEFAULT_SET, 'en', 'planner')] },
    })
    expectCompleteReport(run)
    // SDK retry (maxRetries 1) answers the first 529, runPlanner's own retry the second.
    expect(count(run, 'planner')).toBe(3)
  })

  it('Anthropic 529 overloaded on the Claude leg: stage 1 does not retry it, the client sees failed', async () => {
    quiet()
    const run = await runClientPipeline({ lang: 'es', script: { 'claude-leg': overloaded() } })
    expectFailedWithoutReport(run, /^Analysis failed: 529 .*overloaded_error/)
    expect(count(run, 'claude-leg')).toBe(1)
  })

  it('OpenAI 500 on the GPT leg: the Claude leg alone produces the report', async () => {
    quiet()
    const run = await runClientPipeline({ lang: 'es', script: { 'gpt-leg': openaiServerError() } })
    expectCompleteReport(run)
    expect(count(run, 'gpt-leg')).toBe(1)
    expect(count(run, 'synthesis')).toBe(0)
  })
})

describe('stage 1 replies that are not one clean JSON object', () => {
  it('REAL 2026-10-07 restart ("Wait, let me produce the full complete JSON...") in the Claude leg only: the synthesis rescues it', async () => {
    quiet()
    const run = await runClientPipeline({ lang: 'en', script: { 'claude-leg': claudeLegRestart('en') } })
    expectCompleteReport(run)
  })

  it.each(['en', 'de'] as const)(
    'REAL 2026-10-07 restart (%s) in the Claude leg AND the synthesis: complete report or failed, never a partial report',
    async (lang) => {
      quiet()
      const restart = claudeLegRestart(lang)
      const run = await runClientPipeline({ lang, script: { 'claude-leg': restart, synthesis: restart } })
      if (run.clientView.status === 200) expectCompleteReport(run)
      else expectFailedWithoutReport(run, /^Analysis failed: Unexpected non-whitespace character after JSON/)
    },
  )

  it('2026-10-05 shape (JSON for 7 sections, then markdown) in the Claude leg and the synthesis: failed, the 7 salvaged sections are never served', async () => {
    quiet()
    const broken = jsonThenMarkdown(recording(DEFAULT_SET, 'es', 'synthesis'))
    const run = await runClientPipeline({ lang: 'es', script: { 'claude-leg': broken, synthesis: broken } })
    expectFailedWithoutReport(run, /^Analysis failed: Unexpected non-whitespace character after JSON at position \d+/)
    expect(run.db.tables.reports ?? []).toEqual([])
  })
})

describe('stage 2 failures and the bounded staleness retry', () => {
  it('REAL 2026-10-07 Writer A invalid JSON, then a valid retry: the client gets the report', async () => {
    quiet()
    const run = await runClientPipeline({
      lang: 'es',
      script: { 'writer-A': [writerAInvalidJson(1), recording(DEFAULT_SET, 'es', 'writer-A')] },
    })
    expectCompleteReport(run)
    expect(count(run, 'writer-A')).toBe(2)
  })

  it('REAL 2026-10-07 Writer A invalid JSON on every attempt: never a raw report, 2 staleness retries, then failed', async () => {
    quiet()
    vi.useFakeTimers()
    const run = await runClientPipeline({ lang: 'es', script: { 'writer-A': [writerAInvalidJson(1), writerAInvalidJson(2)] } })
    expect(run.clientView, run.explain()).toEqual({ status: 409, body: { error: 'not_ready', status: 'stage2_processing' } })

    // The client's polling page keeps asking; each stale poll re-runs stage 2, at most twice.
    const views = [await run.poll(STAGE2_STALE_MS), await run.poll(STAGE2_STALE_MS), await run.poll(STAGE2_STALE_MS)]
    expect(views.map((v) => v.body.status), run.explain()).toEqual(['stage2_processing', 'stage2_processing', 'failed'])
    expect(run.row).toMatchObject({ status: 'failed', failure_reason: 'stage2_stale_after_retries', stage2_retry_count: 2 })
    expect(count(run, 'planner'), run.explain()).toBe(3)
    expect(count(run, 'writer-A'), run.explain()).toBe(6)
    expect(count(run, 'claude-leg'), 'stage 1 is never re-run').toBe(1)
  })
})

describe('time budgets (fake timers, real recorded latencies)', () => {
  it('the Claude leg never answers: the SDK gives up at 200s, inside the 270s stage-1 budget, and the client sees failed', async () => {
    quiet()
    vi.useFakeTimers()
    const startedAt = Date.now()
    const run = await runClientPipeline({ lang: 'de', script: { 'claude-leg': hang() } })
    expectFailedWithoutReport(run, /^Analysis failed: Request timed out/)
    expect(count(run, 'claude-leg')).toBe(1)
    expect(Date.now() - startedAt).toBeLessThan(270_000)
  })

  // The real-AI suite allows each stage 80% of its ceiling, i.e. real latency x1.25 must fit.
  it('real recorded latencies x1.25 (German, the slowest language): both stages fit their budgets', async () => {
    quiet()
    vi.useFakeTimers()
    const run = await runClientPipeline({ lang: 'de', latency: 1.25 })
    expectCompleteReport(run)
    expect(run.errors, run.explain()).toEqual([])
  })

  // Once the route's waitUntil task settles, the Vercel function may be frozen, so the
  // still-running synthesis is not counted on (the harness stops advancing time there too).
  it('a slow day (every real latency x2): stage 1 overruns 270s, the client sees failed, no partial report, no second stage 1', async () => {
    quiet()
    vi.useFakeTimers()
    const run = await runClientPipeline({ lang: 'de', latency: 2 })
    expectFailedWithoutReport(run, /^Analysis timed out after 270s$/)
    expect(run.db.tables.reports ?? []).toEqual([])
    expect(count(run, 'claude-leg'), 'the overrun must not start a second paid stage 1').toBe(1)
  })
})
