import { z } from 'zod'
import { COMPARISON_REPORT_SECTION_KEYS } from '@/types/comparison-report'

// All 7 comparison sections required and non-empty.
export const comparisonReportContentSchema = z.object(
  Object.fromEntries(
    COMPARISON_REPORT_SECTION_KEYS.map((key) => [key, z.string().min(1)]),
  ),
) as z.ZodType<Record<typeof COMPARISON_REPORT_SECTION_KEYS[number], string>>
