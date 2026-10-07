// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// analyzeIrisDual (stage 1 of both /client and /practitioner) over REAL full-size replies,
// served at the HTTP layer to the real AnthropicProvider and OpenAIProvider. Prompt
// construction, streaming, truncation retries, parsing, synthesis fallback and the fixation /
// zone-denial guards all run. The other analyze-dual tests keep their small canned replies for
// branch-by-branch checks.

vi.mock('@/lib/supabase/server', async () => {
  const { createFakeDb } = await import('@/test/ai-replay/fake-supabase')
  return { createAdminClient: () => createFakeDb() }
})

import { analyzeIrisDual } from '../analyze-dual'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import { OpenAIProvider } from '@/lib/ai/openai-provider'
import { TIER_MODELS } from '@/lib/ai/get-provider'
import { detectsCorrectLanguage } from '@/app/api/client/upload/language-check'
import { startAiReplay, describeCalls, type Step } from '@/test/ai-replay/replay'
import { claudeLegRestart } from '@/test/ai-replay/failures'
import { REPORT_SECTION_KEYS } from '@/types/report'
import type { Lang, Role } from '@/test/ai-replay/types'

const request = {
  sessionId: '',
  patientId: '',
  rightIrisBase64: 'cmVwbGF5',
  leftIrisBase64: 'cmVwbGF5',
  patientData: { full_name: 'Ana Example', date_of_birth: '1984-03-15', gender: null, general_history: '', symptoms: 'Fatigue', practitioner_notes: '' },
}

async function analyze(lang: Lang, script?: Partial<Record<Role, Step | Step[]>>) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const replay = startAiReplay({ lang, script })
  const providers = {
    anthropic: new AnthropicProvider('replay-anthropic-key', TIER_MODELS.premium_2990.anthropic),
    openai: new OpenAIProvider('replay-openai-key', TIER_MODELS.premium_2990.openai),
  }
  const result = await analyzeIrisDual(request, lang, { providers, forceLanguage: true })
  vi.restoreAllMocks()
  return { result, replay }
}

describe('analyzeIrisDual over recorded real replies', () => {
  it.each<Lang>(['es', 'en', 'de'])('%s: a complete report in the language, no stage-1 call cut off or repeated', async (lang) => {
    const { result, replay } = await analyze(lang)
    expect(result, describeCalls(replay.calls)).not.toHaveProperty('code')
    if ('code' in result) return
    for (const key of REPORT_SECTION_KEYS) expect(result[key].trim().length, key).toBeGreaterThan(40)
    expect(detectsCorrectLanguage(result.section_1_general_terrain, lang)).toBe(true)
    expect(replay.calls.filter((c) => c.outcome !== 'reply'), describeCalls(replay.calls)).toEqual([])
    const roles = replay.calls.map((c) => c.role)
    expect(new Set(roles).size, describeCalls(replay.calls)).toBe(roles.length)
  })

  it('REAL 2026-10-07 restart reply in the Claude leg: the synthesis still produces the complete report', async () => {
    const { result, replay } = await analyze('de', { 'claude-leg': claudeLegRestart('de') })
    expect(result, describeCalls(replay.calls)).not.toHaveProperty('code')
  })
})
