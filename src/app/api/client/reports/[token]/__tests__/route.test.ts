import { describe, it, expect, vi } from 'vitest'

let currentRow: Record<string, unknown> = {
  report_download_token: '00000000-0000-4000-8000-000000000000',
  language: 'es',
  status: 'completed',
  report_id: 'r1',
  reports: { id: 'r1', report_content: { section_1_general_terrain: 'x' } },
}

const updateMock = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: currentRow, error: null }),
        }),
      }),
      update: updateMock,
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

  it('treats a stale "analyzing" row (older than the 290s ceiling) as failed', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000001',
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: new Date(Date.now() - 300_000).toISOString(),
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000001' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('failed')
  })

  it('keeps polling a fresh "analyzing" row (within the ceiling)', async () => {
    currentRow = {
      report_download_token: '00000000-0000-4000-8000-000000000002',
      language: 'en',
      status: 'analyzing',
      report_id: null,
      analyzing_started_at: new Date(Date.now() - 5_000).toISOString(),
      reports: null,
    }
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000002' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.status).toBe('analyzing')
  })
})
