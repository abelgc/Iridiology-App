import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.CRON_SECRET = 'test-cron-secret'

vi.mock('@/lib/client/rescue', () => ({
  sweepStaleAnalyses: vi.fn(),
}))

import { GET } from '../route'
import { sweepStaleAnalyses } from '@/lib/client/rescue'

function request(authHeader?: string): Request {
  return new Request('https://narasimhasolutions.com/api/client/internal/sweep', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

beforeEach(() => {
  vi.mocked(sweepStaleAnalyses).mockReset().mockResolvedValue({ retried: 0, failed: 0, scanned: 0 })
})

describe('GET /api/client/internal/sweep', () => {
  it('rejects a request with no Authorization header and does not touch any analysis', async () => {
    const res = await GET(request() as never)
    expect(res.status).toBe(401)
    expect(sweepStaleAnalyses).not.toHaveBeenCalled()
  })

  it('rejects a request whose bearer token is wrong', async () => {
    const res = await GET(request('Bearer not-the-secret') as never)
    expect(res.status).toBe(401)
    expect(sweepStaleAnalyses).not.toHaveBeenCalled()
  })

  it('runs the sweep and reports what it did when the cron secret matches', async () => {
    vi.mocked(sweepStaleAnalyses).mockResolvedValue({ retried: 2, failed: 1, scanned: 5 })

    const res = await GET(request('Bearer test-cron-secret') as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, retried: 2, failed: 1, scanned: 5 })
    expect(sweepStaleAnalyses).toHaveBeenCalledTimes(1)
  })
})
