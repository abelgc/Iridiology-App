// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// 2026-10-05, stage 1 in production: the synthesis call AND the Claude-only fallback both
// returned a valid JSON object for the first sections, closed it, and wrote the remaining
// sections as markdown ("**Español: Sistema Digestivo e Intestinal**..."). JSON.parse stops at
// the closing brace ("Unexpected non-whitespace character after JSON at position N"),
// recoverJsonBeforeTrailingGarbage hands back the partial object, reportContentSchema rejects
// it, and the client gets "Analysis failed: Unexpected non-whitespace character after JSON...".
//
// Only the model replies are canned; analyzeIrisDual, parseReportResponse, json-repair and the
// schema all run for real.

vi.mock('@/lib/claude/report-metrics', () => ({ recordReportMetrics: async () => {} }))

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { analyzeIrisDual } from '../analyze-dual'
import { parseReportResponse } from '../parse'
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

  it('REPRODUCES the outage: synthesis and the Claude-only fallback both reply in that shape, the client gets "Analysis failed"', async () => {
    const providers = {
      anthropic: { complete: async () => ({ text: JSON_THEN_MARKDOWN, stopReason: 'end_turn' }) },
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'es', { providers: providers as never, forceLanguage: true })
    expect(result).toMatchObject({ code: 'analysis_failed' })
    expect('code' in result && result.message).toMatch(/Unexpected non-whitespace character after JSON at position \d+/)
  })

  it('REAL capture 2026-10-07: a Claude-leg reply that restarts after a 1-section JSON is rejected, though a complete report follows', () => {
    const result = parseReportResponse(REAL_RESTART_REPLY)
    expect('code' in result && result.message).toMatch(/^Unexpected non-whitespace character after JSON at position \d+/)
  })

  it('REAL capture 2026-10-07: had the synthesis slipped the same way, the client would have got "Analysis failed"', async () => {
    const providers = {
      anthropic: { complete: async () => ({ text: REAL_RESTART_REPLY, stopReason: 'end_turn' }) },
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'en', { providers: providers as never, forceLanguage: true })
    expect(result).toMatchObject({ code: 'analysis_failed' })
  })

  // Expected to FAIL until production code changes (this branch does not touch it). Any of a
  // retry of the synthesis, a fall back to the complete GPT leg, or recovering the markdown
  // sections makes it pass: the Claude leg and the first synthesis reply are broken, the GPT
  // leg is a complete valid report, and any later Claude call returns a complete report.
  it.fails('GAP: the client still gets a complete 14-section report when the GPT leg is complete or a retry would succeed', async () => {
    let anthropicCalls = 0
    const providers = {
      anthropic: {
        complete: async () => {
          anthropicCalls++
          return { text: anthropicCalls <= 2 ? JSON_THEN_MARKDOWN : completeReport(), stopReason: 'end_turn' }
        },
      },
      openai: { complete: async () => ({ text: completeReport(), stopReason: 'end_turn' }) },
    }
    const result = await analyzeIrisDual(request, 'es', { providers: providers as never, forceLanguage: true })
    expect(result).not.toHaveProperty('code')
  })
})
