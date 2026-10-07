// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// rewriteReportForClient over REAL full-size replies (src/test/ai-replay/recordings), served at
// the HTTP layer to the pipeline's own Anthropic client. writing-pipeline.test.ts keeps its
// small fixtures for prompt-content checks; this file is where reply size, max_tokens and the
// real parsing meet. A reply is cut at max_tokens exactly when the real one would have been.

vi.mock('@/lib/ai/get-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/get-provider')>()),
  getAnthropicApiKey: async () => 'replay-anthropic-key',
}))

import { rewriteReportForClient } from '../writing-pipeline'
import { parseReportResponse } from '@/lib/claude/parse'
import { isNonRetryableAIError } from '@/lib/ai/errors'
import { detectsCorrectLanguage } from '@/app/api/client/upload/language-check'
import { startAiReplay, describeCalls, type Step } from '@/test/ai-replay/replay'
import { DEFAULT_SET, recording } from '@/test/ai-replay/recordings'
import { creditBalanceTooLow, writerAInvalidJson } from '@/test/ai-replay/failures'
import { REPORT_SECTION_KEYS, type ReportContent } from '@/types/report'
import type { Lang, Role } from '@/test/ai-replay/types'

function stage1Report(lang: Lang): ReportContent {
  const parsed = parseReportResponse(recording(DEFAULT_SET, lang, 'synthesis').response.text)
  if ('code' in parsed) throw new Error(`recorded ${lang} synthesis does not parse: ${parsed.message}`)
  return parsed
}

async function rewrite(lang: Lang, script?: Partial<Record<Role, Step | Step[]>>) {
  const replay = startAiReplay({ lang, script })
  const input = stage1Report(lang)
  try {
    return { result: await rewriteReportForClient(input, lang, 'Ana'), input, replay }
  } catch (error) {
    return { error: error as Error, input, replay }
  }
}

describe('rewriteReportForClient over recorded real replies', () => {
  it.each<Lang>(['es', 'en', 'de'])('%s: all 14 client sections in the language, section 14 passed through, no dashes', async (lang) => {
    const { result, input, replay, error } = await rewrite(lang)
    expect(error, describeCalls(replay.calls)).toBeUndefined()
    expect(Object.keys(result!).sort()).toEqual([...REPORT_SECTION_KEYS].sort())
    for (const key of REPORT_SECTION_KEYS) expect(result![key].trim().length, key).toBeGreaterThan(40)
    expect(detectsCorrectLanguage(result!.section_1_general_terrain, lang)).toBe(true)
    expect(result!.section_14_recommendations).toBe(input.section_14_recommendations)
    expect(Object.values(result!).join('\n')).not.toMatch(/[\u2013\u2014]/)
  })

  // The longest real Planner reply is the German one (4072 output tokens on 2026-10-07).
  it.each<Lang>(['de', 'es', 'en'])(
    'REGRESSION 2026-10-07 response_too_long (%s): no Planner or Writer reply is cut off at its max_tokens, one call each',
    async (lang) => {
      const { replay, error } = await rewrite(lang)
      const cut = replay.calls.filter((c) => c.outcome === 'truncated')
      expect(
        cut,
        `max_tokens below what the real model writes; the client would get no report:\n${describeCalls(replay.calls)}` +
          (error ? `\nthrew: ${error.message}` : ''),
      ).toEqual([])
      expect(replay.calls.map((c) => c.role).sort()).toEqual(['planner', 'writer-A', 'writer-B', 'writer-C'])
    },
  )

  it('REAL 2026-10-07 Writer A invalid JSON twice: throws the exact error the real run threw, no third Writer A call', async () => {
    const { error, replay } = await rewrite('es', { 'writer-A': [writerAInvalidJson(1), writerAInvalidJson(2)] })
    // The real run: "... at position 1389 (line 4 column 737)". The recording greets "Ana"
    // where the real reply greeted "Lucía", two characters shorter.
    expect(error?.message).toBe("Expected ',' or '}' after property value in JSON at position 1387 (line 4 column 737)")
    expect(replay.callsFor('writer-A')).toHaveLength(2)
  })

  it('credit balance too low on Writer B: fails with the non-retryable error after one Writer B call', async () => {
    const { error, replay } = await rewrite('en', { 'writer-B': creditBalanceTooLow() })
    expect(error).toBeDefined()
    expect(isNonRetryableAIError(error)).toBe(true)
    expect(error!.message).toMatch(/credit balance is too low/)
    expect(replay.callsFor('writer-B')).toHaveLength(1)
  })
})
