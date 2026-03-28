import { ReportContent, REPORT_SECTION_KEYS } from '@/types/report'
import { z } from 'zod'

const reportContentSchema = z.object(
  Object.fromEntries(REPORT_SECTION_KEYS.map((key) => [key, z.string().min(1)])),
) as unknown as z.ZodType<ReportContent>

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
