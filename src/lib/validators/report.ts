import { z } from 'zod'
import { REPORT_SECTION_KEYS } from '@/types/report'

export const reportContentSchema = z.object(
  Object.fromEntries(REPORT_SECTION_KEYS.map((key) => [key, z.string().min(1)])),
) as z.ZodType<Record<typeof REPORT_SECTION_KEYS[number], string>>

export const reportUpdateSchema = z.object({
  report_content: reportContentSchema,
})
