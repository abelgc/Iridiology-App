import { describe, it, expect, vi } from 'vitest'

const reportRow = {
  report_download_token: '00000000-0000-4000-8000-000000000000',
  language: 'es',
  status: 'completed',
  report_id: 'r1',
  reports: { id: 'r1', report_content: { section_1_general_terrain: 'x' } },
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: reportRow, error: null }),
        }),
      }),
    }),
  }),
}))

describe('GET /api/client/reports/[token]', () => {
  it('returns report content for valid token', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000000' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report.section_1_general_terrain).toBe('x')
    expect(json.language).toBe('es')
  })

  it('returns 400 for invalid token format', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: 'bad' }),
    } as never)
    expect(res.status).toBe(400)
  })
})
