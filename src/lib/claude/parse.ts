import { ReportContent } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'
import { sanitizeJsonControlCharacters, describeJsonSyntaxError, findJsonObjectCandidates } from './json-repair'
import { z } from 'zod'

export interface ParseError {
  code: 'parse_failed' | 'validation_failed' | 'invalid_json'
  message: string
}

// The last object wins: a model that restarts writes its corrected report after the abandoned one.
function lastCompleteReport(text: string): ReportContent | undefined {
  const candidates = findJsonObjectCandidates(text)
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const validated = reportContentSchema.safeParse(JSON.parse(sanitizeJsonControlCharacters(candidates[i])))
      if (validated.success) return validated.data
    } catch {
      continue
    }
  }
  return undefined
}

export function parseReportResponse(responseText: string): ReportContent | ParseError {
  // Strip markdown code fences
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const sanitized = sanitizeJsonControlCharacters(cleaned)

  try {
    const parsed = JSON.parse(sanitized)
    const validated = reportContentSchema.parse(parsed)
    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        code: 'validation_failed',
        message: error.message,
      }
    }

    if (error instanceof SyntaxError) {
      const recovered = lastCompleteReport(cleaned)
      if (recovered) return recovered
      return {
        code: 'invalid_json',
        message: describeJsonSyntaxError(sanitized, error),
      }
    }

    return {
      code: 'parse_failed',
      message: 'Unknown parsing error',
    }
  }
}
