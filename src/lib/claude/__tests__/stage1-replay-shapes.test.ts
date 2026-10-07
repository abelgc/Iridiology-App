// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Stage-1 JSON integrity against REAL captures. fix/stage1-json-integrity (e01c27a) adds
// output_config.format json_schema on the Claude leg and the synthesis, and makes
// parseReportResponse take the last complete report in a reply. That branch is not in this
// base, so these are it.fails: they fail today and must FAIL to pass. When the fix lands, each
// one starts "passing" and Vitest reports it: turn it.fails into it, set DEFAULT_SET in
// src/test/ai-replay/recordings.ts to 'stage1-structured-2026-10-07', and from then on
// removing either half of the fix fails `npm test`.

vi.mock('@/lib/supabase/server', async () => {
  const { createFakeDb } = await import('@/test/ai-replay/fake-supabase')
  return { createAdminClient: () => createFakeDb() }
})

import { parseReportResponse } from '../parse'
import { analyzeIrisDual } from '../analyze-dual'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import { OpenAIProvider } from '@/lib/ai/openai-provider'
import { TIER_MODELS } from '@/lib/ai/get-provider'
import { startAiReplay } from '@/test/ai-replay/replay'
import { takeAiGuardViolations } from '@/test/ai-replay/guard'
import { claudeLegRestart } from '@/test/ai-replay/failures'
import { REPORT_SECTION_KEYS } from '@/types/report'

describe('stage 1: restart replies and structured output (pending fix/stage1-json-integrity)', () => {
  it.fails.each(['en', 'de'] as const)(
    'GAP: the REAL 2026-10-07 %s restart reply parses into the complete report written after the abandoned one',
    (lang) => {
      const result = parseReportResponse(claudeLegRestart(lang).response.text)
      expect(result).not.toHaveProperty('code')
      if ('code' in result) return
      for (const key of REPORT_SECTION_KEYS) expect(result[key], key).toMatch(/\S/)
    },
  )

  it.fails('GAP: the Claude leg and the synthesis ask Anthropic for the report json_schema (replayed from the structured recordings)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    startAiReplay({ lang: 'es', set: 'stage1-structured-2026-10-07' })
    const providers = {
      anthropic: new AnthropicProvider('replay', TIER_MODELS.premium_2990.anthropic),
      openai: new OpenAIProvider('replay', TIER_MODELS.premium_2990.openai),
    }
    const result = await analyzeIrisDual(
      { sessionId: '', patientId: '', rightIrisBase64: 'cmVwbGF5', leftIrisBase64: 'cmVwbGF5', patientData: { full_name: 'Ana Example', date_of_birth: '1984-03-15', gender: null, general_history: '', symptoms: '', practitioner_notes: '' } },
      'es',
      { providers, forceLanguage: true },
    )
    // Today the requests carry no output format, so the replay refuses them as STRUCTURED OUTPUT DRIFT.
    const violations = takeAiGuardViolations()
    vi.restoreAllMocks()
    expect(violations).toEqual([])
    expect(result).not.toHaveProperty('code')
  })
})
