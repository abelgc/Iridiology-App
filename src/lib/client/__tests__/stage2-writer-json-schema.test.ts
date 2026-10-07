import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-10-07, `npm run test:real-ai`, premium es: Writer A (claude-sonnet-5, end_turn) wrote its
// JSON, then "Espera, corregí el formato JSON...", then a second object with a raw newline inside
// a string. Both attempts failed JSON.parse ("Bad control character in string literal" /
// "Expected ',' or '}' after property value"), so stage 2 threw and the client would wait for the
// staleness retry. Free text lets the model close the object and keep writing; a json_schema
// output format makes the API decode exactly one object with the writer's own keys.
//
// Only the SDK's network call is replaced; rewriteReportForClient, the Planner, the three Writers
// and their parsing run for real.

const createMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: createMock } }
  }),
}))

vi.mock('@/lib/ai/get-provider', () => ({
  getAnthropicApiKey: async () => 'test-anthropic-api-key',
}))

import { rewriteReportForClient } from '../writing-pipeline'
import { REPORT_SECTION_KEYS, type ReportContent } from '@/types/report'

const WRITER_KEYS: Record<'A' | 'B' | 'C', string[]> = {
  A: [
    'section_1_general_terrain',
    'section_2_emotional_field',
    'section_3_cognitive_nervous',
    'section_4_immune_lymphatic',
    'section_5_endocrine_hormonal',
  ],
  B: [
    'section_6_circulatory_cardiorespiratory',
    'section_7_hepatic',
    'section_8_digestive_intestinal',
    'section_9_renal_urinary',
    'section_10_structural_integumentary',
  ],
  C: ['section_11_detected_axes', 'section_12_conclusion', 'section_13_strengths_of_the_body'],
}

const report = Object.fromEntries(
  REPORT_SECTION_KEYS.map((key) => [key, `Hallazgo clínico para ${key}.`]),
) as unknown as ReportContent

const brief = {
  dominantPattern: 'carga hepatobiliar funcional',
  mainDriver: 'flujo biliar lento',
  symptomFindingMap: [],
  systemVerdicts: Object.fromEntries(
    WRITER_KEYS.A.slice(1).concat(WRITER_KEYS.B).map((key) => [key, { verdict: 'fine', clue: 'estable' }]),
  ),
  crossSystemLinks: [],
  knownDiagnoses: [],
  strengths: [],
  safety: { flags: [], constraint: null },
}

type Format = { type?: string; schema?: { type?: string; properties?: Record<string, { type?: string }>; required?: string[]; additionalProperties?: unknown } }

const formatsByWriter: Record<string, Format | undefined> = {}

beforeEach(() => {
  for (const key of Object.keys(formatsByWriter)) delete formatsByWriter[key]
  createMock.mockReset()
  createMock.mockImplementation(async (params: { system: string; output_config?: { format?: Format } }) => {
    const role = params.system.match(/You are Writer ([ABC])\./)?.[1] as 'A' | 'B' | 'C' | undefined
    if (!role) return { content: [{ type: 'text', text: JSON.stringify(brief) }], stop_reason: 'end_turn' }
    formatsByWriter[role] = params.output_config?.format
    const sections = Object.fromEntries(WRITER_KEYS[role].map((key) => [key, `Texto para el cliente, ${key}.`]))
    return { content: [{ type: 'text', text: JSON.stringify(sections) }], stop_reason: 'end_turn' }
  })
})

describe('stage 2: each Writer is constrained to its own sections at the API (2026-10-07 Writer A restart)', () => {
  it.each(['A', 'B', 'C'] as const)('Writer %s requests output_config.format json_schema requiring exactly its sections', async (role) => {
    const result = await rewriteReportForClient(report, 'es', 'Lucía')
    for (const key of WRITER_KEYS[role]) expect(result[key as keyof ReportContent], key).toMatch(/\S/)

    const format = formatsByWriter[role]
    expect(format, `Writer ${role} asks Anthropic for free text, not its sections schema`).toMatchObject({
      type: 'json_schema',
      schema: { type: 'object', additionalProperties: false },
    })
    expect([...(format!.schema!.required ?? [])].sort()).toEqual([...WRITER_KEYS[role]].sort())
    expect(Object.keys(format!.schema!.properties ?? {}).sort()).toEqual([...WRITER_KEYS[role]].sort())
    for (const key of WRITER_KEYS[role]) expect(format!.schema!.properties![key], key).toMatchObject({ type: 'string' })
  })
})
