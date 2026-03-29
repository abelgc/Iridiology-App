import { z } from 'zod'
import { REPORT_SECTION_KEYS } from '@/types/report'

// section_13 (protocol) is intentionally left empty for the practitioner to fill manually
const OPTIONAL_SECTIONS = new Set(['section_13_protocolo_tratamiento'])

export const reportContentSchema = z.object(
  Object.fromEntries(
    REPORT_SECTION_KEYS.map((key) => [
      key,
      OPTIONAL_SECTIONS.has(key) ? z.string() : z.string().min(1),
    ]),
  ),
) as z.ZodType<Record<typeof REPORT_SECTION_KEYS[number], string>>

export const reportUpdateSchema = z.object({
  report_content: reportContentSchema,
})
