import { sanitizeJsonControlCharacters, describeJsonSyntaxError, recoverJsonBeforeTrailingGarbage } from '../json-repair'

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const TAB = String.fromCharCode(9)
const BELL = String.fromCharCode(7)

describe('sanitizeJsonControlCharacters', () => {
  it('fixes the exact production failure: a raw newline inside a string value', () => {
    const broken = '{"section_1": "Line one' + NL + 'Line two", "section_2": "fine"}'

    expect(() => JSON.parse(broken)).toThrow(/control character/i)

    const fixed = sanitizeJsonControlCharacters(broken)
    const parsed = JSON.parse(fixed) as { section_1: string; section_2: string }
    expect(parsed.section_1).toBe('Line one' + NL + 'Line two')
    expect(parsed.section_2).toBe('fine')
  })

  it('escapes raw tab and carriage return inside string values', () => {
    const broken = '{"a": "col1' + TAB + 'col2", "b": "line1' + CR + 'line2"}'
    const parsed = JSON.parse(sanitizeJsonControlCharacters(broken)) as { a: string; b: string }
    expect(parsed.a).toBe('col1' + TAB + 'col2')
    expect(parsed.b).toBe('line1' + CR + 'line2')
  })

  it('escapes an arbitrary raw control character (not one of the named escapes)', () => {
    const broken = '{"a": "bell' + BELL + 'here"}'
    const parsed = JSON.parse(sanitizeJsonControlCharacters(broken)) as { a: string }
    expect(parsed.a).toBe('bell' + BELL + 'here')
  })

  it('does not touch structural whitespace outside string literals', () => {
    const valid = '{' + NL + '  "a": "x",' + NL + '  "b": "y"' + NL + '}'
    const sanitized = sanitizeJsonControlCharacters(valid)
    expect(sanitized).toBe(valid)
    expect(JSON.parse(sanitized)).toEqual({ a: 'x', b: 'y' })
  })

  it('is idempotent — an already-escaped newline stays a two-character escape, not double-escaped', () => {
    const alreadyValid = '{"a": "line1\\nline2"}'
    expect(sanitizeJsonControlCharacters(alreadyValid)).toBe(alreadyValid)
    const parsed = JSON.parse(sanitizeJsonControlCharacters(alreadyValid)) as { a: string }
    expect(parsed.a).toBe('line1' + NL + 'line2')
  })

  it('handles escaped quotes inside a string value without breaking the string-literal boundary', () => {
    const broken = '{"a": "she said \\"hi\\"' + NL + 'then left"}'
    const parsed = JSON.parse(sanitizeJsonControlCharacters(broken)) as { a: string }
    expect(parsed.a).toBe('she said "hi"' + NL + 'then left')
  })

  it('handles multiple string values with raw newlines in the same object, matching a real 15-section report shape', () => {
    const broken =
      '{"section_1_general_terrain": "Para one.' +
      NL +
      'Para two.", "section_2_emotional_field": "Fine.", "section_15_iris_sign_patterns": "- finding one' +
      NL +
      '- finding two"}'
    const parsed = JSON.parse(sanitizeJsonControlCharacters(broken)) as Record<string, string>
    expect(parsed.section_1_general_terrain).toBe('Para one.' + NL + 'Para two.')
    expect(parsed.section_2_emotional_field).toBe('Fine.')
    expect(parsed.section_15_iris_sign_patterns).toBe('- finding one' + NL + '- finding two')
  })

  it('leaves genuinely malformed JSON still broken (does not mask real structural errors)', () => {
    const trulyBroken = '{"a": "fine", "b": }'
    expect(() => JSON.parse(sanitizeJsonControlCharacters(trulyBroken))).toThrow()
  })
})

describe('describeJsonSyntaxError', () => {
  it('includes a snippet of text around the reported error position', () => {
    const text = 'x'.repeat(100) + '<BROKEN>' + 'y'.repeat(100)
    let error: SyntaxError
    try {
      JSON.parse('{"a": "' + text + '}') // deliberately malformed to get a real V8 SyntaxError with a position
      throw new Error('expected JSON.parse to throw')
    } catch (e) {
      error = e as SyntaxError
    }
    const description = describeJsonSyntaxError(text, error)
    expect(description).toContain(error.message)
  })

  it('falls back to the bare error message when no position is present', () => {
    const error = new SyntaxError('Unexpected end of JSON input')
    expect(describeJsonSyntaxError('anything', error)).toBe('Unexpected end of JSON input')
  })
})

describe('recoverJsonBeforeTrailingGarbage', () => {
  function trailingGarbageError(text: string): SyntaxError {
    try {
      JSON.parse(text)
      throw new Error('expected JSON.parse to throw')
    } catch (e) {
      return e as SyntaxError
    }
  }

  it('REGRESSION (2026-07-19 production incident): recovers a complete object followed by the model self-correcting mid-generation', () => {
    // Reproduces the exact production shape: "Analysis failed: Unexpected non-whitespace
    // character after JSON at position 1462 ... near: '...}\n'<<HERE>>'```\n\nI need to
    // provide the full JSON with all 14 keys. Let me complete the analy'"
    const text =
      '{"section_1_general_terrain": "content"}\n```\n\nI need to provide the full JSON with all 14 keys. Let me complete the analy'
    const error = trailingGarbageError(text)
    expect(error.message).toMatch(/Unexpected non-whitespace character after JSON/)

    const recovered = recoverJsonBeforeTrailingGarbage(text, error)
    expect(recovered).toEqual({ section_1_general_terrain: 'content' })
  })

  it('returns undefined for a different SyntaxError shape (e.g. unterminated string), so it never misfires on an unrelated failure', () => {
    const text = '{"section_1_general_terrain": "unterminated'
    const error = trailingGarbageError(text)
    expect(error.message).toMatch(/Unterminated string/)

    expect(recoverJsonBeforeTrailingGarbage(text, error)).toBeUndefined()
  })

  it('returns undefined when the recovered prefix itself still does not parse', () => {
    // Crafts an error whose reported position doesn't actually land on valid JSON, proving
    // this function never guesses — it only returns a value when the prefix genuinely parses.
    const fakeError = new SyntaxError('Unexpected non-whitespace character after JSON at position 3')
    expect(recoverJsonBeforeTrailingGarbage('{"a', fakeError)).toBeUndefined()
  })
})
