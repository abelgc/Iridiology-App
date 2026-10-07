// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { detect } from 'tinyld'

// The paid client flow end to end, offline: upload route -> stage 1 -> stage 2 route -> the
// report endpoint the client polls, over REAL full-size model replies recorded on 2026-10-07
// (src/test/ai-replay/recordings). Every line of production code runs, the SDKs included;
// only the HTTP answer of the model APIs is replayed and Supabase is in memory.
// Failure shapes: paid-flow-failures.replay.test.ts.

vi.mock('@/lib/supabase/server', async () => (await import('@/test/ai-replay/client-pipeline')).supabaseServerMock())
vi.mock('@vercel/functions', async () => (await import('@/test/ai-replay/client-pipeline')).vercelFunctionsMock())

import { runClientPipeline, deliveredReport } from '@/test/ai-replay/client-pipeline'
import { REPORT_SECTION_KEYS } from '@/types/report'
import type { Lang } from '@/test/ai-replay/types'

afterEach(() => {
  vi.restoreAllMocks()
})

function quiet() {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

// The first run pays for loading the route modules; under a full parallel `npm test` that alone
// can pass the default 5s.
describe('paid client flow over recorded real replies', { timeout: 30_000 }, () => {
  it.each<Lang>(['es', 'en', 'de'])('%s: the client receives a complete report in their language, each paid call made once', async (lang) => {
    quiet()
    const run = await runClientPipeline({ lang })

    expect(run.upload.status).toBe(200)
    expect(
      run.clientView.status,
      `the client did not get a report: ${JSON.stringify(run.clientView.body)}\n${run.explain()}`,
    ).toBe(200)
    const report = deliveredReport(run.clientView)!
    for (const key of REPORT_SECTION_KEYS) expect(report[key]?.trim().length ?? 0, key).toBeGreaterThan(40)
    expect(Object.keys(report).sort()).toEqual([...REPORT_SECTION_KEYS].sort())
    expect(detect(REPORT_SECTION_KEYS.map((k) => report[k]).join('\n'))).toBe(lang)
    expect(run.clientView.body.language).toBe(lang)
    expect(run.row).toMatchObject({ status: 'completed', failure_reason: null })

    const roles = run.calls.map((c) => c.role)
    expect(new Set(roles).size, `a paid call was repeated:\n${run.explain()}`).toBe(roles.length)
    expect(run.calls.filter((c) => c.outcome !== 'reply'), `no call may be cut off or fail:\n${run.explain()}`).toEqual([])
    for (const role of ['gpt-leg', 'claude-leg', 'synthesis', 'jyotish-chakra', 'jyotish-blend', 'planner', 'writer-A', 'writer-B', 'writer-C'] as const) {
      expect(roles, role).toContain(role)
    }
  })
})
