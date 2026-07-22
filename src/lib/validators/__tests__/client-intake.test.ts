import { describe, it, expect } from 'vitest'
import { clientIntakeSchema } from '@/lib/validators/client-intake'

const baseValid = {
  language: 'en',
  payment_tier: 'basic_1990',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  main_complaint: 'Persistent fatigue',
  symptom_duration: '6 months',
  current_medications: 'None',
  date_of_birth: '1990-05-12',
  country_of_birth: 'Mexico',
  city_of_birth: 'Mexico City',
  time_of_day: 'morning',
}

describe('clientIntakeSchema', () => {
  it('accepts a fully filled intake', () => {
    const parsed = clientIntakeSchema.parse(baseValid)
    expect(parsed.email).toBe('jane@example.com')
  })

  it('rejects invalid email', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, email: 'not-an-email' })).toThrow()
  })

  it('rejects unknown payment_tier', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, payment_tier: 'free' })).toThrow()
  })

  it('rejects unknown language', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, language: 'fr' })).toThrow()
  })

  it('accepts german language', () => {
    const parsed = clientIntakeSchema.parse({ ...baseValid, language: 'de' })
    expect(parsed.language).toBe('de')
  })

  it('allows current_medications to be empty', () => {
    const parsed = clientIntakeSchema.parse({ ...baseValid, current_medications: '' })
    expect(parsed.current_medications).toBe('')
  })

  it('rejects time_of_day values outside the allowed set', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, time_of_day: 'noon' })).toThrow()
  })
})
