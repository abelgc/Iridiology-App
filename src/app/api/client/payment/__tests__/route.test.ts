import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
const fromMock = vi.fn(() => ({
  update: (...args: unknown[]) => {
    updateMock(...args)
    return {
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { report_download_token: 'token-1', status: 'paid' },
            error: null,
          }),
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

beforeEach(() => {
  updateMock.mockClear()
  fromMock.mockClear()
  process.env.NODE_ENV = 'test'
})

describe('POST /api/client/payment (mock)', () => {
  it('marks the row paid in mock mode', async () => {
    const { POST } = await import('@/app/api/client/payment/route')
    const req = new Request('http://test/api/client/payment', {
      method: 'POST',
      body: JSON.stringify({ report_download_token: '00000000-0000-4000-8000-000000000000' }),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe('paid')
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('refuses mock payment in production', async () => {
    process.env.NODE_ENV = 'production'
    const { POST } = await import('@/app/api/client/payment/route')
    const req = new Request('http://test/api/client/payment', {
      method: 'POST',
      body: JSON.stringify({ report_download_token: '00000000-0000-4000-8000-000000000000' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })
})
