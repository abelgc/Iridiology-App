import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
const fromMock = vi.fn(() => ({
  insert: (...args: unknown[]) => {
    insertMock(...args)
    return {
      select: () => ({
        single: () => Promise.resolve({
          data: { id: 'analysis-id', report_download_token: 'token-123' },
          error: null,
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))
vi.mock('@/lib/client/report-token', () => ({
  generateReportToken: () => 'generated-token',
}))

beforeEach(() => {
  insertMock.mockClear()
  fromMock.mockClear()
})

describe('POST /api/client/intake', () => {
  it('creates a row and returns the token', async () => {
    const { POST } = await import('@/app/api/client/intake/route')
    const body = {
      language: 'en',
      payment_tier: 'basic_12',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      main_complaint: 'Fatigue',
      symptom_duration: '6 months',
      current_medications: '',
      date_of_birth: '1990-05-12',
      country_of_birth: 'Mexico',
      city_of_birth: 'Mexico City',
      time_of_day: 'morning',
    }
    const req = new Request('http://test/api/client/intake', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.report_download_token).toBeDefined()
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('returns 400 on invalid payload', async () => {
    const { POST } = await import('@/app/api/client/intake/route')
    const req = new Request('http://test/api/client/intake', {
      method: 'POST',
      body: JSON.stringify({ language: 'fr' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})
