// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'

// 2026-10-05, stage 1 in production: the synthesis call AND the Claude-only fallback both
// returned a valid JSON object for the first sections, closed it, and wrote the remaining
// sections as markdown ("**Español: Sistema Digestivo e Intestinal**..."). JSON.parse stops at
// the closing brace ("Unexpected non-whitespace character after JSON at position N"),
// recoverJsonBeforeTrailingGarbage hands back the partial object, reportContentSchema rejects
// it, and the client gets "Analysis failed: Unexpected non-whitespace character after JSON...".
//
// Only the model replies are canned; analyzeIrisDual, parseReportResponse, json-repair and the
// schema all run for real. Where a test needs the request that reaches Anthropic, the real
// AnthropicProvider runs and only the SDK's network call is replaced.

vi.mock('@/lib/claude/report-metrics', () => ({ recordReportMetrics: async () => {} }))

import { readFileSync } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { analyzeIrisDual } from '../analyze-dual'
import { parseReportResponse } from '../parse'
import { AnthropicProvider } from '@/lib/ai/anthropic-provider'
import { TIER_MODELS } from '@/lib/ai/get-provider'
import { REPORT_SECTION_KEYS } from '@/types/report'
const JSON_SECTIONS: Record<string, string> = {
  section_1_general_terrain:
    'Constitución linfático-biliar con densidad de fibra media. La carga principal se concentra en el eje hepato-digestivo.',
  section_2_emotional_field:
    'Anillos nerviosos concéntricos en ambos iris: tensión sostenida del sistema nervioso autónomo. Se recomienda trabajar el Chakra del Plexo Solar.',
  section_3_cognitive_nervous: 'Zona cerebral superior con fibra regular; la regulación hipotálamo-hipofisaria mantiene un tono estable.',
  section_4_immune_lymphatic: 'Rosario linfático tenue en el sector inferior derecho: estasis linfática leve.',
  section_5_endocrine_hormonal: 'Zona tiroidea con pigmento suave a las 2 en el iris izquierdo; carga suprarrenal moderada.',
  section_6_circulatory_cardiorespiratory: 'Sin arco senil. Zona cardíaca con fibra densa y buena reserva.',
  section_7_hepatic: 'Pigmento marrón en la zona hepática a las 8 del iris derecho: hígado lento, flujo biliar reducido.',
}

const MARKDOWN_TAIL = `

**Español: Sistema Digestivo e Intestinal**

La corona del collarete aparece distendida en el sector inferior, con lagunas pequeñas en el colon descendente. Digestión lenta y fermentación.

**Español: Sistema Renal y Urinario**

Zona renal con fibra abierta a las 6 en ambos iris: carga renal moderada.

**Español: Sistema Estructural y Tegumentario**

Anillo de piel marcado: eliminación cutánea reducida.

**Español: Ejes Detectados**

- Hígado lento y digestión lenta se refuerzan mutuamente.

**Español: Conclusión**

Prioridad: eje hepato-digestivo, luego linfático.

**Español: Fortalezas del Cuerpo**

Tejido denso y bien tejido; buena reserva cardíaca.

**Español: Recomendaciones**

Hígado: diente de león, cardo mariano.
`

// The production failure shape: complete JSON for sections 1-7, then markdown for 8-15.
const JSON_THEN_MARKDOWN = JSON.stringify(JSON_SECTIONS, null, 2) + MARKDOWN_TAIL

// Verbatim Claude-leg reply (claude-sonnet-5, stop_reason end_turn) captured by
// `npm run test:real-ai` on 2026-10-07, en, fictional intake: a fenced JSON object with only
// section_1, then "Wait, let me produce the full complete JSON with all 14 keys properly.",
// then a second, complete JSON. The de run the same day did the same ("Entschuldigung, ich
// muss das korrigieren..."). The synthesis happened to rescue both runs.
const REAL_RESTART_REPLY = readFileSync(
  path.join(__dirname, 'fixtures', 'stage1-claude-leg-restart-en-2026-10-07.txt'),
  'utf8',
)
// Same day, de, 9281 output tokens of 16000, end_turn: 1-section JSON, "Entschuldigung, ich muss
// den Bericht vollständig und korrekt im geforderten JSON...", then the complete report.
const REAL_RESTART_REPLY_DE = readFileSync(
  path.join(__dirname, 'fixtures', 'stage1-claude-leg-restart-de-2026-10-07.txt'),
  'utf8',
)

function completeReport(): string {
  const keys = [
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
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, `Hallazgo completo para ${k}.`])))
}

const request = {
  sessionId: '',
  patientId: '',
  rightIrisBase64: 'AAA',
  leftIrisBase64: 'BBB',
  patientData: { full_name: 'Ana', date_of_birth: '1984-03-15', gender: null, general_history: '', symptoms: '', practitioner_notes: '' },
}

describe('stage 1: a model reply with JSON for some sections and markdown for the rest (2026-10-05 outage)', () => {
  it('parseReportResponse rejects it with the exact production error, even though recovery salvages 7 sections', () => {
    const result = parseReportResponse(JSON_THEN_MARKDOWN)
    expect('code' in result && result.code).toBe('invalid_json')
    expect('code' in result && result.message).toMatch(/^Unexpected non-whitespace character after JSON at position \d+/)
  })

  it('never serves the 7 salvaged sections: when every Claude reply has that shape the client gets "Analysis failed"', async () => {
    const providers = {
      anthropic: { complete: async () => ({ text: JSON_THEN_MARKDOWN, stopReason: 'end_turn' }) },
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'es', { providers: providers as never, forceLanguage: true })
    expect(result).toMatchObject({ code: 'analysis_failed' })
    expect('code' in result && result.message).toMatch(/Unexpected non-whitespace character after JSON at position \d+/)
  })

  it.each([
    ['en', REAL_RESTART_REPLY, 'Both irides show a greenish-hazel appearance'],
    ['de', REAL_RESTART_REPLY_DE, ''],
  ])('REAL capture 2026-10-07 (%s): a Claude-leg reply that restarts after a 1-section JSON parses into the complete report that follows', (_lang, reply, secondVersionStart) => {
    const result = parseReportResponse(reply)
    expect(result, JSON.stringify(result).slice(0, 300)).not.toHaveProperty('code')
    if ('code' in result) return
    for (const key of REPORT_SECTION_KEYS) expect(result[key], key).toMatch(/\S/)
    if (secondVersionStart) expect(result.section_1_general_terrain.startsWith(secondVersionStart)).toBe(true)
  })

  it('REAL capture 2026-10-07: when the synthesis and the Claude leg both restart that way, the client still gets the complete report', async () => {
    const providers = {
      anthropic: { complete: async () => ({ text: REAL_RESTART_REPLY, stopReason: 'end_turn' }) },
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'en', { providers: providers as never, forceLanguage: true })
    expect(result, JSON.stringify(result).slice(0, 300)).not.toHaveProperty('code')
    if ('code' in result) return
    expect(result.section_14_recommendations).toContain('**Liver**')
    expect(result.section_12_conclusion).toMatch(/^This case centres on a functional, not structural/)
  })
})

describe('stage 1: the Claude leg and the synthesis are constrained to the report schema at the API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const fourteenSections = () => JSON.stringify(Object.fromEntries(REPORT_SECTION_KEYS.map((k) => [k, `Hallazgo para ${k}.`])))

  interface SentToAnthropic {
    hasImages: boolean
    system: string
    format: { type?: string; schema?: { type?: string; properties?: Record<string, { type?: string }>; required?: string[]; additionalProperties?: unknown } } | undefined
  }

  async function requestsSentToAnthropic(model: string): Promise<SentToAnthropic[]> {
    const sent: SentToAnthropic[] = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(Anthropic.Messages.prototype, 'stream').mockImplementation(((params: Anthropic.MessageStreamParams) => {
      const content = params.messages[0].content
      sent.push({
        hasImages: Array.isArray(content) && content.some((part) => part.type === 'image'),
        system: Array.isArray(params.system) ? params.system.map((b) => b.text).join('') : String(params.system ?? ''),
        format: (params as { output_config?: { format?: SentToAnthropic['format'] } }).output_config?.format ?? undefined,
      })
      return {
        finalMessage: async () => ({
          content: [{ type: 'text', text: fourteenSections() }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      }
    }) as never)
    const providers = {
      anthropic: new AnthropicProvider('offline-test-key', model),
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'es', { providers: providers as never, forceLanguage: true })
    expect(result, JSON.stringify(result).slice(0, 300)).not.toHaveProperty('code')
    return sent
  }

  // The 2026-10-07 production failure (token 191e1f53, basic tier) came from Haiku; the 2026-10-07
  // real-AI restarts came from Sonnet. Free text lets either model close the object early and
  // keep writing; a json_schema output format makes the API decode only a complete object.
  it.each([
    ['basic_1990', TIER_MODELS.basic_1990.anthropic],
    ['premium_2990', TIER_MODELS.premium_2990.anthropic],
  ])('%s (%s): Claude leg and synthesis request output_config.format json_schema requiring all 14 sections', async (_tier, model) => {
    const sent = await requestsSentToAnthropic(model)
    const calls = {
      'claude-leg': sent.find((s) => s.hasImages),
      synthesis: sent.find((s) => s.system.includes('definitive iris analysis report')),
    }
    for (const [label, call] of Object.entries(calls)) {
      expect(call, `${label} request not sent`).toBeDefined()
      expect(call!.format, `${label} (${model}) asks Anthropic for free text, not the report schema`).toMatchObject({
        type: 'json_schema',
        schema: { type: 'object', additionalProperties: false },
      })
      const schema = call!.format!.schema!
      expect([...(schema.required ?? [])].sort(), `${label} required keys`).toEqual([...REPORT_SECTION_KEYS].sort())
      expect(Object.keys(schema.properties ?? {}).sort(), `${label} properties`).toEqual([...REPORT_SECTION_KEYS].sort())
      for (const key of REPORT_SECTION_KEYS) expect(schema.properties![key], `${label}.${key}`).toMatchObject({ type: 'string' })
    }
  })
})
