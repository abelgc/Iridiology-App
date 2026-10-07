// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Stage-1 JSON integrity against REAL captures. parseReportResponse takes the last complete
// report in a restart reply, and the Claude leg / synthesis send output_config.format
// json_schema. Removing either half fails these tests.

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

describe('stage 1: restart replies and structured output', () => {
  it.each(['en', 'de'] as const)(
    'the REAL 2026-10-07 %s restart reply parses into the complete report written after the abandoned one',
    (lang) => {
      const result = parseReportResponse(claudeLegRestart(lang).response.text)
      expect(result).not.toHaveProperty('code')
      if ('code' in result) return
      for (const key of REPORT_SECTION_KEYS) expect(result[key], key).toMatch(/\S/)
    },
  )

  it('the Claude leg and the synthesis ask Anthropic for the report json_schema', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    startAiReplay({ lang: 'es' })
    const providers = {
      anthropic: new AnthropicProvider('replay', TIER_MODELS.premium_2990.anthropic),
      openai: new OpenAIProvider('replay', TIER_MODELS.premium_2990.openai),
    }
    const result = await analyzeIrisDual(
      { sessionId: '', patientId: '', rightIrisBase64: 'cmVwbGF5', leftIrisBase64: 'cmVwbGF5', patientData: { full_name: 'Ana Example', date_of_birth: '1984-03-15', gender: null, general_history: '', symptoms: '', practitioner_notes: '' } },
      'es',
      { providers, forceLanguage: true },
    )
    const violations = takeAiGuardViolations()
    vi.restoreAllMocks()
    expect(violations).toEqual([])
    expect(result).not.toHaveProperty('code')
  })
})
