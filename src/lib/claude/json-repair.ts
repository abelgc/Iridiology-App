/**
 * Models occasionally emit a raw control character (almost always a literal newline byte)
 * inside a JSON string value instead of the escaped backslash-n — this breaks JSON.parse
 * with "Bad control character in string literal", discarding an otherwise-valid, fully-
 * generated response. Escapes any raw control character (code point 0-31) found INSIDE a
 * JSON string literal before parsing. Never touches characters outside string literals
 * (structural whitespace, commas, braces), so it can't turn genuinely invalid JSON into
 * something that silently parses wrong.
 */
export function sanitizeJsonControlCharacters(raw: string): string {
  return raw.replace(/"(?:[^"\\]|\\.)*"/g, (stringLiteral) => {
    let result = ''
    for (const ch of stringLiteral) {
      const code = ch.charCodeAt(0)
      if (code > 0x1f) {
        result += ch
        continue
      }
      if (ch === '\n') {
        result += '\\n'
      } else if (ch === '\r') {
        result += '\\r'
      } else if (ch === '\t') {
        result += '\\t'
      } else if (ch === '\b') {
        result += '\\b'
      } else if (ch === '\f') {
        result += '\\f'
      } else {
        result += '\\u' + code.toString(16).padStart(4, '0')
      }
    }
    return result
  })
}

/**
 * Builds a short snippet of `text` around the character position reported in a JSON
 * SyntaxError's message (V8's JSON.parse errors include "... at position N"), so a failure
 * log shows what actually broke instead of just a bare position number that requires
 * re-fetching the original response to make sense of.
 */
export function describeJsonSyntaxError(text: string, error: SyntaxError): string {
  const match = error.message.match(/position (\d+)/)
  if (!match) return error.message
  const pos = Number(match[1])
  const start = Math.max(0, pos - 80)
  const end = Math.min(text.length, pos + 80)
  return `${error.message} — near: ${JSON.stringify(text.slice(start, pos))}<<HERE>>${JSON.stringify(text.slice(pos, end))}`
}
