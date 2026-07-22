import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let selectResult: { data: unknown; error: unknown } = { data: null, error: null }
let updateResult: { data: unknown; error: unknown } = { data: null, error: null }
const updateMock = vi.fn()
const selectMock = vi.fn()

const fromMock = vi.fn(() => ({
  select: (...args: unknown[]) => {
    selectMock(...args)
    return {
      eq: () => ({
        single: () => Promise.resolve(selectResult),
      }),
    }
  },
  update: (...args: unknown[]) => {
    updateMock(...args)
    return {
      eq: () => ({
        eq: () => ({
          select: () => ({
            single: () => Promise.resolve(updateResult),
          }),
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

const VALID_TOKEN = '00000000-0000-4000-8000-000000000000'

function makeRequest(token = VALID_TOKEN) {
  return new Request('http://test/api/client/payment', {
    method: 'POST',
    body: JSON.stringify({ report_download_token: token }),
  }) as never
}

beforeEach(() => {
  updateMock.mockClear()
  selectMock.mockClear()
  fromMock.mockClear()
  process.env.ENABLE_MOCK_PAYMENT = 'true'
  selectResult = { data: null, error: null }
  updateResult = { data: null, error: null }
})

afterEach(() => {
  delete process.env.ENABLE_MOCK_PAYMENT
})

describe('POST /api/client/payment (mock)', () => {
  it('marks the row paid when intake_pending (happy path)', async () => {
    selectResult = { data: { report_download_token: VALID_TOKEN, status: 'intake_pending' }, error: null }
    updateResult = { data: { report_download_token: VALID_TOKEN, status: 'paid' }, error: null }

    const { POST } = await import('@/app/api/client/payment/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('paid')
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('returns 404 when the token is not found', async () => {
    selectResult = { data: null, error: { message: 'not found' } }

    const { POST } = await import('@/app/api/client/payment/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toBe('token_not_found')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('passes through idempotently when the row already progressed past payment', async () => {
    selectResult = { data: { report_download_token: VALID_TOKEN, status: 'analyzing' }, error: null }

    const { POST } = await import('@/app/api/client/payment/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('analyzing')
    expect(json.report_download_token).toBe(VALID_TOKEN)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the guarded update loses the race (0 rows affected)', async () => {
    selectResult = { data: { report_download_token: VALID_TOKEN, status: 'intake_pending' }, error: null }
    updateResult = { data: null, error: null }

    const { POST } = await import('@/app/api/client/payment/route')
    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('already_processing')
  })

  it('refuses mock payment when ENABLE_MOCK_PAYMENT is not set', async () => {
    delete process.env.ENABLE_MOCK_PAYMENT
    const { POST } = await import('@/app/api/client/payment/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })
})
