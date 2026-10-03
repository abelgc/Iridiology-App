import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PatientList } from '../patient-list'
import type { Patient } from '@/types/database'

const CREATED_AT = '2026-10-03T16:40:47Z'

function madridSessionText(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Madrid' })
}

describe('PatientList', () => {
  it('REGRESSION (React #418 last-session hydration): last session is Europe/Madrid, identical on server and client', () => {
    const patient: Patient & { sessions: { created_at: string }[] } = {
      id: 'p1',
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
      full_name: 'Ana Test',
      date_of_birth: null,
      country_of_birth: null,
      city_of_birth: null,
      time_of_day: null,
      gender: null,
      email: null,
      phone: null,
      general_history: null,
      notes: null,
      sessions: [{ created_at: CREATED_AT }],
    }

    render(<PatientList patients={[patient]} />)

    const expected = madridSessionText(CREATED_AT)
    expect(expected).toContain('18:40:47')
    expect(screen.getAllByText(expected)).toHaveLength(2)
  })
})
