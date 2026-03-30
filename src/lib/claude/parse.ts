import { ReportContent } from '@/types/report'
import { reportContentSchema } from '@/lib/validators/report'
import { z } from 'zod'

export interface ParseError {
  code: 'parse_failed' | 'validation_failed' | 'invalid_json'
  message: string
}

export function parseReportResponse(responseText: string): ReportContent | ParseError {
  // Strip markdown code fences
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
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
      return {
        code: 'invalid_json',
        message: error.message,
      }
    }

    return {
      code: 'parse_failed',
      message: 'Unknown parsing error',
    }
  }
}
