import { ComparisonReportContent } from '@/types/comparison-report'
import { comparisonReportContentSchema } from '@/lib/validators/comparison-report'
import { type ParseError } from './parse'
import { z } from 'zod'

// Mirror of parseReportResponse, but validates against the 7-key comparison
// (evolution) schema instead of the 13-key standard schema.
export function parseComparisonResponse(
  responseText: string,
): ComparisonReportContent | ParseError {
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    return comparisonReportContentSchema.parse(parsed) as ComparisonReportContent
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { code: 'validation_failed', message: error.message }
    }
    if (error instanceof SyntaxError) {
      return { code: 'invalid_json', message: error.message }
    }
    return { code: 'parse_failed', message: 'Unknown parsing error' }
  }
}
