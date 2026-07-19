import { parseReportResponse } from '../parse'

const NL = String.fromCharCode(10)

const ALL_15_KEYS = [
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

function reportJson(overrides: Record<string, string> = {}): string {
  const obj: Record<string, string> = {}
  for (const key of ALL_15_KEYS) {
    obj[key] = overrides[key] ?? `Content for ${key}.`
  }
  return JSON.stringify(obj)
}

describe('parseReportResponse', () => {
  it('parses a well-formed 15-section report', () => {
    const result = parseReportResponse(reportJson())
    expect('code' in result).toBe(false)
  })

  it('strips markdown code fences before parsing', () => {
    const result = parseReportResponse('```json\n' + reportJson() + '\n```')
    expect('code' in result).toBe(false)
  })

  it('REGRESSION (2026-07-19 production incident): recovers when a section contains a raw, unescaped newline instead of \\n', () => {
    // Reproduces the exact production failure: Claude's synthesis response had a raw newline
    // byte inside a JSON string value, which used to make JSON.parse throw "Bad control
    // character in string literal" and discard an otherwise fully-generated, valid report.
    const brokenJsonText = reportJson().replace(
      '"Content for section_1_general_terrain."',
      '"Paragraph one.' + NL + 'Paragraph two.' + NL + 'Paragraph three."',
    )

    // Sanity check: this text is genuinely broken raw JSON (proves the test reproduces the
    // real failure mode, not a no-op).
    expect(() => JSON.parse(brokenJsonText)).toThrow(/control character/i)

    const result = parseReportResponse(brokenJsonText)

    expect('code' in result).toBe(false)
    if (!('code' in result)) {
      expect(result.section_1_general_terrain).toBe('Paragraph one.' + NL + 'Paragraph two.' + NL + 'Paragraph three.')
    }
  })

  it('returns invalid_json (not a silent failure) for genuinely malformed JSON', () => {
    const result = parseReportResponse('{"section_1_general_terrain": "unterminated')
    expect('code' in result && result.code).toBe('invalid_json')
  })

  it('invalid_json error message includes a snippet of the failing text, not just a bare position number', () => {
    const result = parseReportResponse('{"section_1_general_terrain": "unterminated')
    if ('code' in result) {
      expect(result.message).toContain('near:')
    } else {
      throw new Error('expected an invalid_json ParseError')
    }
  })

  it('returns validation_failed when JSON is well-formed but missing a required section', () => {
    const obj: Record<string, string> = {}
    for (const key of ALL_15_KEYS) {
      if (key === 'section_15_iris_sign_patterns') continue
      obj[key] = `Content for ${key}.`
    }
    const result = parseReportResponse(JSON.stringify(obj))
    expect('code' in result && result.code).toBe('validation_failed')
  })

  it('REGRESSION (2026-07-19 production incident): recovers a full 15-section report with trailing self-correction text after it', () => {
    // Reproduces the exact production failure: "Unexpected non-whitespace character after
    // JSON at position 1462 — near: '...}\n'<<HERE>>'```\n\nI need to provide the full JSON
    // with all 14 keys. Let me complete the analy'" — Claude produced a complete, valid
    // report, then appended trailing commentary while apparently second-guessing itself.
    const textWithTrailingGarbage =
      reportJson() + '\n```\n\nI need to provide the full JSON with all 14 keys. Let me complete the analy'

    const result = parseReportResponse(textWithTrailingGarbage)

    expect('code' in result).toBe(false)
    if (!('code' in result)) {
      expect(result.section_1_general_terrain).toBe('Content for section_1_general_terrain.')
    }
  })

  it('does NOT recover trailing garbage when the JSON prefix itself is missing a required section — the Zod re-validation guard actually blocks a shorter, invalid document', () => {
    const obj: Record<string, string> = {}
    for (const key of ALL_15_KEYS) {
      if (key === 'section_15_iris_sign_patterns') continue
      obj[key] = `Content for ${key}.`
    }
    const incompleteWithTrailingGarbage = JSON.stringify(obj) + '\n```\n\nLet me try again from scratch.'

    const result = parseReportResponse(incompleteWithTrailingGarbage)

    expect('code' in result && result.code).toBe('invalid_json')
  })
})
