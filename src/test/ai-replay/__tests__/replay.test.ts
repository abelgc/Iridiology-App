// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeRecordedSet } from '../record'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import { OpenAIProvider } from '@/lib/ai/openai-provider'
import { TIER_MODELS } from '@/lib/ai/get-provider'
import { takeAiGuardViolations, aiProviderForUrl } from '../guard'
import { startAiReplay, budgetFaithful } from '../replay'
import { DEFAULT_SET, RECORDINGS_DIR, failureRecording, recording, rolesInSet, setManifest } from '../recordings'
import { anonymize, toRecording } from '../convert'
import { classifyRequest } from '../roles'
import type { Lang, Recording } from '../types'

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }))

afterEach(() => {
  vi.restoreAllMocks()
})

const PREMIUM = TIER_MODELS.premium_2990

describe('network guard: npm test cannot reach a paid model API', () => {
  it('blocks AnthropicProvider (stage 1, guards, Jyotish) and records a violation', async () => {
    const provider = new AnthropicProvider('sk-ant-would-be-real', PREMIUM.anthropic)
    await expect(provider.complete({ systemPrompt: 's', userText: 'u', images: [], maxTokens: 10 })).rejects.toThrow()
    const violations = takeAiGuardViolations()
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatch(/BLOCKED a real anthropic call to https:\/\/api\.anthropic\.com\/v1\/messages/)
  })

  it('blocks OpenAIProvider (the GPT leg)', async () => {
    const provider = new OpenAIProvider('sk-would-be-real', PREMIUM.openai)
    await expect(provider.complete({ systemPrompt: 's', userText: 'u', images: [], maxTokens: 10 })).rejects.toThrow()
    expect(takeAiGuardViolations()[0]).toMatch(/BLOCKED a real openai call to https:\/\/api\.openai\.com\/v1\/chat\/completions/)
  })

  it('blocks a directly constructed Anthropic client (the writing pipeline builds its own)', async () => {
    const client = new Anthropic({ apiKey: 'sk-ant-would-be-real', maxRetries: 0 })
    await expect(
      client.messages.create({ model: PREMIUM.anthropic, max_tokens: 10, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow()
    expect(takeAiGuardViolations()[0]).toMatch(/BLOCKED/)
  })

  it('still fails the test when production code swallows the error (the Jyotish step returns the report unchanged)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.doMock('@/lib/ai/get-provider', () => ({ getAIProvider: async () => new AnthropicProvider('k', PREMIUM.anthropic) }))
    vi.resetModules()
    const { enhanceEmotionalFieldWithJyotish } = await import('@/lib/claude/enhance-emotional-field')
    const report = { section_2_emotional_field: 'x' } as never
    const birth = { date_of_birth: '1984-03-15', country_of_birth: 'Spain', city_of_birth: 'Valencia', time_of_day: 'morning' }
    await expect(enhanceEmotionalFieldWithJyotish(report, 'Ana', birth, 'es')).resolves.toBe(report)
    expect(takeAiGuardViolations()[0]).toMatch(/BLOCKED a real anthropic call/)
    vi.doUnmock('@/lib/ai/get-provider')
  })

  it('recognises model API URLs by path too, so a *_BASE_URL override cannot slip past', () => {
    expect(aiProviderForUrl('https://proxy.internal/v1/messages')).toBe('anthropic')
    expect(aiProviderForUrl('https://proxy.internal/v1/chat/completions')).toBe('openai')
    expect(aiProviderForUrl('http://localhost:3000/api/client/internal/stage2')).toBeNull()
    expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
  })
})

describe('budget-faithful replay', () => {
  const planner = recording(DEFAULT_SET, 'de', 'planner')

  it('serves the full real reply when max_tokens covers it', () => {
    const served = budgetFaithful(planner, 8000)
    expect(served).toMatchObject({ stopReason: 'end_turn', outputTokens: planner.response.usage.outputTokens, truncated: false })
  })

  it('cuts the reply at max_tokens with stop_reason max_tokens, like the API', () => {
    const served = budgetFaithful(planner, 1200)
    expect(served).toMatchObject({ stopReason: 'max_tokens', outputTokens: 1200, truncated: true })
    if ('text' in served) expect(() => JSON.parse(served.text)).toThrow(SyntaxError)
  })

  // Calibration against reality: the Planner's real replies at max_tokens 1200 and 2400 (master
  // before 4c3bd5c) were captured. Cutting a full real reply proportionally lands within 10% of
  // where the API really cut, so a replayed truncation looks like a real one.
  it.each<Lang>(['es', 'en', 'de'])('%s: a replayed cut at 1200 / 2400 tokens is within 10%% of the real cut-off length', (lang) => {
    const full = recording(DEFAULT_SET, lang, 'planner')
    for (const budget of [1200, 2400] as const) {
      const real = failureRecording(`planner-cut-off-${budget}-${lang}`)
      expect(real.response).toMatchObject({ stopReason: 'max_tokens', usage: { outputTokens: budget } })
      const served = budgetFaithful(full, budget)
      if (!('text' in served)) throw new Error(served.error)
      const ratio = served.text.length / real.response.text.length
      expect(ratio, `${lang}@${budget}: replayed ${served.text.length} chars, real ${real.response.text.length}`).toBeGreaterThan(0.9)
      expect(ratio).toBeLessThan(1.1)
    }
  })

  it('refuses to invent the rest of a reply that was itself cut off', () => {
    const cut = failureRecording('planner-cut-off-1200-de')
    expect(budgetFaithful(cut, 8000)).toMatchObject({ error: expect.stringMatching(/itself cut off at 1200 tokens/) })
    expect(budgetFaithful(cut, 1000)).toMatchObject({ stopReason: 'max_tokens', outputTokens: 1000 })
  })
})

describe('request contract: drift from what was recorded fails the test', () => {
  function plannerRequest(overrides: Record<string, unknown>) {
    return {
      model: PREMIUM.anthropic,
      max_tokens: 8000,
      thinking: { type: 'disabled' as const },
      system: 'You are the Planner for a client iridology report. LANGUAGE: Write every string value in your JSON response in German.',
      messages: [{ role: 'user' as const, content: '{}' }],
      ...overrides,
    }
  }

  async function send(overrides: Record<string, unknown>) {
    startAiReplay({ lang: 'de' })
    const client = new Anthropic({ apiKey: 'replay', maxRetries: 0 })
    return client.messages.create(plannerRequest(overrides) as never)
  }

  it('serves the recording for a request shaped like production', async () => {
    const message = await send({})
    expect(message.stop_reason).toBe('end_turn')
    expect(message.usage.output_tokens).toBe(recording(DEFAULT_SET, 'de', 'planner').response.usage.outputTokens)
    expect(takeAiGuardViolations()).toEqual([])
  })

  it('MODEL DRIFT: another model than the recording', async () => {
    await expect(send({ model: 'claude-haiku-4-5-20251001' })).rejects.toThrow()
    expect(takeAiGuardViolations().join()).toMatch(/MODEL DRIFT planner\/de/)
  })

  it('THINKING DRIFT: Sonnet without thinking disabled would spend the budget thinking', async () => {
    await expect(send({ thinking: undefined })).rejects.toThrow()
    expect(takeAiGuardViolations().join()).toMatch(/THINKING DRIFT planner\/de/)
  })

  it('STRUCTURED OUTPUT DRIFT: a json_schema output format the recording was not made with', async () => {
    await expect(send({ output_config: { format: { type: 'json_schema', schema: { type: 'object' } } } })).rejects.toThrow()
    expect(takeAiGuardViolations().join()).toMatch(/STRUCTURED OUTPUT DRIFT planner\/de/)
  })

  it('an unknown production call is refused, not answered with something plausible', async () => {
    await expect(send({ system: 'You are a brand-new helper.' })).rejects.toThrow()
    expect(takeAiGuardViolations().join()).toMatch(/cannot tell which production call this is/)
  })
})

describe('recordings', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') && !p.endsWith('set.json') ? [p] : []
    })
  }

  it('each file sits under the role and language it records', () => {
    for (const file of walk(RECORDINGS_DIR)) {
      const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording
      expect(rec.format).toBe(1)
      if (file.includes(`${path.sep}failures${path.sep}`)) continue
      expect(path.basename(file, '.json'), file).toBe(rec.role)
      expect(path.basename(path.dirname(file)), file).toBe(rec.lang)
    }
  })

  it.each<Lang>(['es', 'en', 'de'])('%s: the default set has a complete, uncut real reply for every call of the paid flow', (lang) => {
    const roles = rolesInSet(DEFAULT_SET, lang)
    for (const role of ['gpt-leg', 'claude-leg', 'synthesis', 'jyotish-chakra', 'jyotish-blend', 'planner', 'writer-A', 'writer-B', 'writer-C'] as const) {
      expect(roles, `${lang}/${role}`).toContain(role)
      const rec = recording(DEFAULT_SET, lang, role)
      expect(rec.response.stopReason, `${lang}/${role}`).toBe('end_turn')
      expect(rec.response.usage.outputTokens, `${lang}/${role}`).toBeGreaterThan(50)
    }
  })

  it('every set manifest names the commit whose prompts it was recorded with', () => {
    for (const set of readdirSync(RECORDINGS_DIR).filter((d) => d !== 'failures')) {
      expect(setManifest(set).commit, set).toMatch(/^[0-9a-f]{7,}$/)
    }
  })

  it('the classifier puts each recorded role back on the same role and language', () => {
    for (const lang of ['es', 'en', 'de'] as const) {
      const writer = classifyRequest('anthropic', {
        model: 'm',
        max_tokens: 1,
        system: `You are Writer B. Write in ${{ es: 'Spanish', en: 'English', de: 'German' }[lang]}. You are writing part of...`,
        messages: [{ role: 'user', content: '{}' }],
      })
      expect(writer).toMatchObject({ role: 'writer-B', lang })
    }
  })
})

describe('anonymize', () => {
  it('scrubs emails, keys, request ids, report tokens and phone numbers, keeps dates', () => {
    const out = anonymize(
      'Mail ana.lopez@gmail.com, key sk-ant-api03-abcdefghijklmnopqrstuv, req_011CTabcdefgh, token 3f2b8c1e-1d2a-4b3c-8d4e-5f6a7b8c9d0e, tel +34 612 345 678, born 1984-03-15.',
    )
    expect(out).toBe(
      'Mail client@example.com, key sk-REDACTED, req_REDACTED, token 00000000-0000-4000-8000-000000000000, tel +00 000 000 000, born 1984-03-15.',
    )
  })

  it('replaces the given full and first names, case-sensitively, so ordinary words survive', () => {
    expect(anonymize('Lucía Prueba: Lucía, una prueba de laboratorio.', ['Lucía Prueba'])).toBe(
      'Ana Example: Ana, una prueba de laboratorio.',
    )
  })

  it('record mode writes one anonymized recording per role and language, plus the set manifest', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ai-replay-'))
    try {
      const call = {
        lang: 'es', label: 'writer-A', provider: 'anthropic' as const, model: 'claude-sonnet-5', maxTokens: 3000,
        inputTokens: 7000, outputTokens: 1200, stopReason: 'end_turn', ms: 12000, text: '{"section_1_general_terrain":"Lucía, ..."}', error: null,
      }
      const written = writeRecordedSet('tmp-set', [call, { ...call, label: 'planner' }], dir)
      expect(written.map((f) => path.relative(dir, f)).sort()).toEqual([path.join('tmp-set', 'es', 'planner.json'), path.join('tmp-set', 'es', 'writer-A.json')])
      const saved = JSON.parse(readFileSync(path.join(dir, 'tmp-set', 'es', 'writer-A.json'), 'utf8')) as Recording
      expect(saved.response).toEqual({ text: '{"section_1_general_terrain":"Ana, ..."}', stopReason: 'end_turn', usage: { inputTokens: 7000, outputTokens: 1200 } })
      expect(JSON.parse(readFileSync(path.join(dir, 'tmp-set', 'set.json'), 'utf8'))).toMatchObject({ name: 'tmp-set' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('toRecording maps a real-AI suite call and drops calls that cannot be replayed', () => {
    const call = {
      lang: 'de', label: 'planner', provider: 'anthropic' as const, model: 'claude-sonnet-5', maxTokens: 8000,
      inputTokens: 10, outputTokens: 20, stopReason: 'end_turn', ms: 5, text: 'Liebe Lena', error: null,
    }
    expect(toRecording(call, { run: 'r', capturedAt: 't', names: ['Lena Test'] })?.response.text).toBe('Liebe Ana')
    expect(toRecording({ ...call, error: 'boom' }, { run: 'r', capturedAt: 't' })).toBeNull()
    expect(toRecording({ ...call, label: 'stage2-other(x)' }, { run: 'r', capturedAt: 't' })).toBeNull()
  })
})
