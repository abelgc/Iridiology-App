// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'

// Offline budget guard: no network, runs in `npm test`. The real prompt construction runs; the
// SDK `messages.create` / provider.complete calls are intercepted only to read the max_tokens
// each call asks for and to hand back a minimal valid reply so the pipeline keeps going.
//
// Every floor below comes from REAL output sizes measured by `npm run test:real-ai`
// (src/lib/client/__real_ai__/client-pipeline.real-ai.test.ts). A call must ask for at least
// measured / 0.75 tokens: the same 25% headroom the real suite enforces.

vi.mock('@/lib/ai/get-provider', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/get-provider')>()
  return { ...real, getAnthropicApiKey: async () => 'offline-test-key' }
})
vi.mock('@/lib/claude/report-metrics', () => ({ recordReportMetrics: async () => {} }))

import { rewriteReportForClient } from '../writing-pipeline'
import { analyzeIrisDual } from '@/lib/claude/analyze-dual'
import type { CompletionRequest } from '@/lib/ai/types'
import type { ReportContent } from '@/types/report'

const HEADROOM = 0.75

// Largest real output seen per call: 2026-10-07, prompts of origin/master bd6f515, premium_2990
// (claude-sonnet-5 / gpt-5.6-sol), fictional intake, iris e2e/fixtures/face-eye-left.jpg,
// 2 runs per language (de 3). Stage-2 sizes come from a scratch copy with the Planner at 8000
// and the Writers at 6000 so nothing was cut off; on master the Planner never finishes.
// German Writer A once wrote 3519 tokens because it also wrote Writer B's sections (8-10); that
// off-spec reply is left out here. `shape` fingerprints what the call is asked to produce; when
// it changes, these numbers are stale and must be re-measured.
const MEASURED = {
  'stage2.planner': {
    outputTokens: 3967,
    perLanguage: { es: 2991, en: 3246, de: 3967 },
    measured: '2026-10-07, bd6f515',
    shape: '33f4e6f22060',
  },
  'stage2.writer-A': { outputTokens: 1670, perLanguage: { es: 1173, en: 1190, de: 1670 }, measured: '2026-10-07, bd6f515' },
  'stage2.writer-B': { outputTokens: 1851, perLanguage: { es: 952, en: 995, de: 1851 }, measured: '2026-10-07, bd6f515' },
  'stage2.writer-C': { outputTokens: 1172, perLanguage: { es: 912, en: 805, de: 1172 }, measured: '2026-10-07, bd6f515' },
  'stage1.claude-leg': { outputTokens: 9281, perLanguage: { es: 6251, en: 6337, de: 9281 }, measured: '2026-10-07, bd6f515' },
  'stage1.gpt-leg': { outputTokens: 1627, perLanguage: { es: 1472, en: 1420, de: 1627 }, measured: '2026-10-07, bd6f515' },
  'stage1.synthesis': {
    outputTokens: 8608,
    perLanguage: { es: 6701, en: 5839, de: 8608 },
    measured: '2026-10-07, bd6f515',
    shape: '718b99b6b8b6',
  },
} as const

type MeasuredCall = keyof typeof MEASURED

function requiredMaxTokens(call: MeasuredCall): number {
  return Math.ceil(MEASURED[call].outputTokens / HEADROOM)
}

function budgetMessage(call: MeasuredCall, maxTokens: number, retryMaxTokens?: number): string {
  const m = MEASURED[call]
  const per = Object.entries(m.perLanguage)
    .map(([lang, n]) => `${lang} ${n}`)
    .join(', ')
  return [
    `${call} asks for max_tokens ${maxTokens}${retryMaxTokens ? ` (retry ${retryMaxTokens})` : ''},`,
    `but real runs (${m.measured}) produced up to ${m.outputTokens} output tokens for this call (${per}).`,
    `It needs at least ${requiredMaxTokens(call)} (measured / ${HEADROOM}) on the FIRST attempt.`,
    `Below that, the model stops on max_tokens, the truncation retry doubles the wall time, and if the`,
    `retry is still too small the call throws "response_too_long" and the client never gets a report.`,
    call === 'stage2.planner'
      ? `That is the 2026-10-05 outage: 0cf9667 made the Planner return findings[] for 9 systems plus strengths[] while keeping max_tokens 1200 (retry 2400).`
      : `Re-measure with \`npm run test:real-ai\` after any prompt change that makes this call write more.`,
  ].join(' ')
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

const SECTION_KEYS = [
  'section_1_general_terrain',
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
  'section_11_detected_axes',
  'section_12_conclusion',
  'section_13_strengths_of_the_body',
  'section_14_recommendations',
  'section_15_iris_sign_patterns',
]

function report(): ReportContent {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, `Finding for ${k}.`]))
}

const BRIEF = {
  dominantPattern: 'p',
  mainDriver: 'd',
  symptomFindingMap: [],
  systemVerdicts: Object.fromEntries(
    SECTION_KEYS.slice(1, 10).map((k) => [k, { verdict: 'fine', clue: 'c', findings: ['f'] }]),
  ),
  crossSystemLinks: [],
  strengths: ['s'],
  knownDiagnoses: [],
  safety: { flags: [], constraint: null },
}

interface CapturedClaudeCall {
  system: string
  maxTokens: number
}

async function captureStage2Calls(lang: string): Promise<CapturedClaudeCall[]> {
  const captured: CapturedClaudeCall[] = []
  vi.spyOn(Anthropic.Messages.prototype, 'create').mockImplementation((async (params: Anthropic.MessageCreateParams) => {
    const system = typeof params.system === 'string' ? params.system : ''
    captured.push({ system, maxTokens: params.max_tokens })
    let text = JSON.stringify(BRIEF)
    const writer = system.match(/You write exactly these sections, using the shared BRIEF you are given as your only source: ([^.]+)\./)
    if (writer) {
      text = JSON.stringify(Object.fromEntries(writer[1].split(',').map((k) => [k.trim(), 'Prose.'])))
    }
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }
  }) as never)
  await rewriteReportForClient(report(), lang, 'Ana')
  return captured
}

async function captureStage1Calls(lang: string) {
  const anthropic: CompletionRequest[] = []
  const openai: CompletionRequest[] = []
  const reply = async () => ({ text: JSON.stringify(report()), stopReason: 'end_turn' })
  const providers = {
    anthropic: { complete: async (r: CompletionRequest) => (anthropic.push(r), reply()) },
    openai: { complete: async (r: CompletionRequest) => (openai.push(r), reply()) },
  }
  const result = await analyzeIrisDual(
    {
      sessionId: '',
      patientId: '',
      rightIrisBase64: 'AAA',
      leftIrisBase64: 'BBB',
      patientData: { full_name: 'Ana', date_of_birth: '1984-03-15', gender: null, general_history: '', symptoms: '', practitioner_notes: '' },
    },
    lang,
    { providers: providers as never, forceLanguage: true },
  )
  expect('code' in result, JSON.stringify(result)).toBe(false)
  return { anthropic, openai }
}

function plannerShape(system: string): string {
  const start = system.indexOf('with exactly these keys:')
  const end = system.indexOf('\nBase every field')
  return system.slice(start, end)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('token budgets: every model call asks for enough output tokens for what its prompt requests', () => {
  // The German run is the longest, and max_tokens does not depend on the language.
  it('REGRESSION 2026-10-05 response_too_long: stage-2 Planner max_tokens covers its findings[] + strengths[] brief', async () => {
    const calls = await captureStage2Calls('de')
    const planner = calls.find((c) => c.system.startsWith('You are the Planner'))
    expect(planner, 'Planner call not found').toBeDefined()
    expect(planner!.maxTokens, budgetMessage('stage2.planner', planner!.maxTokens, planner!.maxTokens * 2)).toBeGreaterThanOrEqual(
      requiredMaxTokens('stage2.planner'),
    )
  })

  it('stage-2 Writers A, B, C max_tokens cover their sections', async () => {
    const calls = await captureStage2Calls('de')
    for (const role of ['A', 'B', 'C'] as const) {
      const writer = calls.find((c) => c.system.startsWith(`You are Writer ${role}`))
      expect(writer, `Writer ${role} call not found`).toBeDefined()
      const key = `stage2.writer-${role}` as MeasuredCall
      expect.soft(writer!.maxTokens, budgetMessage(key, writer!.maxTokens, writer!.maxTokens * 2)).toBeGreaterThanOrEqual(requiredMaxTokens(key))
    }
  })

  it('stage-1 Claude leg, GPT leg and synthesis max_tokens cover a full report', async () => {
    const { anthropic, openai } = await captureStage1Calls('de')
    const leg = anthropic.find((r) => r.images.length > 0)!
    const synthesis = anthropic.find((r) => r.systemPrompt.includes('definitive iris analysis report'))!
    const gpt = openai[0]
    expect.soft(leg.maxTokens, budgetMessage('stage1.claude-leg', leg.maxTokens)).toBeGreaterThanOrEqual(requiredMaxTokens('stage1.claude-leg'))
    expect.soft(gpt.maxTokens, budgetMessage('stage1.gpt-leg', gpt.maxTokens)).toBeGreaterThanOrEqual(requiredMaxTokens('stage1.gpt-leg'))
    expect.soft(synthesis.maxTokens, budgetMessage('stage1.synthesis', synthesis.maxTokens)).toBeGreaterThanOrEqual(
      requiredMaxTokens('stage1.synthesis'),
    )
  })

  it('the Planner output shape is the one its budget was measured for', async () => {
    const calls = await captureStage2Calls('en')
    const planner = calls.find((c) => c.system.startsWith('You are the Planner'))!
    const shape = sha(plannerShape(planner.system))
    expect(
      shape,
      `The Planner's requested JSON shape changed (fingerprint ${MEASURED['stage2.planner'].shape} -> ${shape}). ` +
        `Its max_tokens (${planner.maxTokens}) was sized for the old shape; a bigger shape with the same budget is ` +
        `exactly what truncated every premium report on 2026-10-05. Run \`npm run test:real-ai\`, read the planner ` +
        `out/max column, then update MEASURED['stage2.planner'] (outputTokens, perLanguage, shape) and max_tokens in ` +
        `writing-pipeline.ts runPlanner if needed.`,
    ).toBe(MEASURED['stage2.planner'].shape)
  })

  it('the stage-1 report shape (requested section keys) is the one its budget was measured for', async () => {
    const { anthropic } = await captureStage1Calls('en')
    const leg = anthropic.find((r) => r.images.length > 0)!
    const keys = [...new Set(leg.systemPrompt.match(/section_\d+_[a-z_]+/g) ?? [])].sort().join(',')
    const shape = sha(keys)
    expect(
      shape,
      `The stage-1 prompt now asks for a different set of sections (fingerprint ${MEASURED['stage1.synthesis'].shape} -> ${shape}: ${keys}). ` +
        `The Claude leg / GPT leg / synthesis budgets were measured for the old set. Run \`npm run test:real-ai\` and ` +
        `update MEASURED for stage1.* before shipping.`,
    ).toBe(MEASURED['stage1.synthesis'].shape)
  })
})
