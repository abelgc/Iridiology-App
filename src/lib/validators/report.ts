import { z } from 'zod'
import { REPORT_SECTION_KEYS } from '@/types/report'
import { comparisonReportContentSchema } from './comparison-report'

// No optional sections - all 12 sections must be provided
const OPTIONAL_SECTIONS = new Set<string>()

export const reportContentSchema = z.object(
  Object.fromEntries(
    REPORT_SECTION_KEYS.map((key) => [
      key,
      OPTIONAL_SECTIONS.has(key) ? z.string() : z.string().min(1),
    ]),
  ),
) as z.ZodType<Record<typeof REPORT_SECTION_KEYS[number], string>>

// Anthropic structured outputs reject minLength, so non-empty sections are still enforced by
// reportContentSchema after parsing.
export const reportOutputJsonSchema = {
  type: 'object',
  properties: Object.fromEntries(REPORT_SECTION_KEYS.map((key) => [key, { type: 'string' }])),
  required: [...REPORT_SECTION_KEYS],
  additionalProperties: false,
}

export const reportContentUnionSchema = z.union([reportContentSchema, comparisonReportContentSchema])

export const reportUpdateSchema = z.object({
  report_content: reportContentUnionSchema,
})
