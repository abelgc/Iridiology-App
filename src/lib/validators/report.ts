import { z } from 'zod'
import { REPORT_SECTION_KEYS, PRACTITIONER_ONLY_SECTION_KEYS } from '@/types/report'
import { comparisonReportContentSchema } from './comparison-report'

const ALL_STANDARD_SECTION_KEYS = [...REPORT_SECTION_KEYS, ...PRACTITIONER_ONLY_SECTION_KEYS] as const

// No optional sections - all sections must be provided
const OPTIONAL_SECTIONS = new Set<string>()

export const reportContentSchema = z.object(
  Object.fromEntries(
    ALL_STANDARD_SECTION_KEYS.map((key) => [
      key,
      OPTIONAL_SECTIONS.has(key) ? z.string() : z.string().min(1),
    ]),
  ),
) as z.ZodType<Record<typeof ALL_STANDARD_SECTION_KEYS[number], string>>

export const reportContentUnionSchema = z.union([reportContentSchema, comparisonReportContentSchema])

export const reportUpdateSchema = z.object({
  report_content: reportContentUnionSchema,
})
