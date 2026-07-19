import { parseComparisonResponse } from '../parse-comparison'

const NL = String.fromCharCode(10)

function comparisonJson(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    comp_1_improvements: overrides.comp_1_improvements ?? 'Lymphatic flow has improved.',
    comp_2_not_improved: overrides.comp_2_not_improved ?? 'Hepatic congestion persists.',
  })
}

describe('parseComparisonResponse', () => {
  it('parses a well-formed 2-section comparison report', () => {
    const result = parseComparisonResponse(comparisonJson())
    expect('code' in result).toBe(false)
  })

  it('strips markdown code fences before parsing', () => {
    const result = parseComparisonResponse('```json\n' + comparisonJson() + '\n```')
    expect('code' in result).toBe(false)
  })

  it('recovers when a section contains a raw, unescaped newline instead of \\n', () => {
    const broken = comparisonJson().replace(
      '"Lymphatic flow has improved."',
      '"Lymphatic flow' + NL + 'has improved."',
    )
    expect(() => JSON.parse(broken)).toThrow(/control character/i)

    const result = parseComparisonResponse(broken)
    expect('code' in result).toBe(false)
    if (!('code' in result)) {
      expect(result.comp_1_improvements).toBe('Lymphatic flow' + NL + 'has improved.')
    }
  })

  it('REGRESSION: recovers a complete comparison report with trailing self-correction text after it', () => {
    const withTrailingGarbage = comparisonJson() + '\n```\n\nLet me finalize the comparison properly.'
    const result = parseComparisonResponse(withTrailingGarbage)
    expect('code' in result).toBe(false)
    if (!('code' in result)) {
      expect(result.comp_1_improvements).toBe('Lymphatic flow has improved.')
    }
  })

  it('does NOT recover trailing garbage when the JSON prefix is missing a required key', () => {
    const incomplete = JSON.stringify({ comp_1_improvements: 'Only one key.' }) + '\n```\n\nLet me redo this.'
    const result = parseComparisonResponse(incomplete)
    expect('code' in result && result.code).toBe('invalid_json')
  })

  it('returns invalid_json for genuinely malformed JSON', () => {
    const result = parseComparisonResponse('{"comp_1_improvements": "unterminated')
    expect('code' in result && result.code).toBe('invalid_json')
  })

  it('returns validation_failed when JSON is well-formed but missing a required key', () => {
    const result = parseComparisonResponse(JSON.stringify({ comp_1_improvements: 'only one' }))
    expect('code' in result && result.code).toBe('validation_failed')
  })
})
