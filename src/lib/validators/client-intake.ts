import { z } from 'zod'
import { healthQuestionnaireSchema } from './health-questionnaire'

export const clientIntakeSchema = z.object({
  language: z.enum(['en', 'es']),
  payment_tier: z.enum(['basic_12', 'premium_19_90']),
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  main_complaint: z.string().min(1).max(2000),
  symptom_duration: z.string().min(1).max(255),
  current_medications: z.string().max(2000).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country_of_birth: z.string().min(1).max(255),
  city_of_birth: z.string().min(1).max(255),
  time_of_day: z.enum(['morning', 'evening']),
  health_questionnaire: healthQuestionnaireSchema.optional().default({}),
})

export type ClientIntakeInput = z.infer<typeof clientIntakeSchema>
