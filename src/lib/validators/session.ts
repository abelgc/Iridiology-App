import { z } from 'zod'

export const sessionCreateSchema = z.object({
  patient_id: z.string().uuid(),
  session_date: z.string(),
  symptoms: z.string().optional(),
  practitioner_notes: z.string().optional(),
  analysis_mode: z.enum(['standard', 'comparison', 'technical_review']),
  practitioner_interpretation: z.string().optional(),
})
