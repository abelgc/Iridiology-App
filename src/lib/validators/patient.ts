import { z } from 'zod'

export const patientCreateSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(255),
  date_of_birth: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  general_history: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const patientUpdateSchema = patientCreateSchema.partial()
export type PatientCreateInput = z.infer<typeof patientCreateSchema>
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>
