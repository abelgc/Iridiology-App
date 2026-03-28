import { z } from 'zod'

export const correctionCreateSchema = z.object({
  section_key: z.string().min(1),
  original_content: z.string().min(1),
  corrected_content: z.string().min(1),
  correction_notes: z.string().optional(),
})
