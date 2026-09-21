import { describe, it, expect, vi, beforeEach } from 'vitest'

let selectResolves: { data: Array<{ key: string; value: string }> | null; error: { message: string } | null } = { data: [], error: null }
const upsertMock = vi.fn()
let upsertResolves: { error: { message: string } | null } = { error: null }

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: () => Promise.resolve(selectResolves) }),
      upsert: (...args: unknown[]) => {
        upsertMock(...args)
        return Promise.resolve(upsertResolves)
      },
    }),
  }),
}))

import { GET, POST } from '../route'

function postRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/settings', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  selectResolves = { data: [], error: null }
  upsertResolves = { error: null }
  upsertMock.mockClear()
})

describe('GET /api/settings', () => {
  it('masks any key ending in "_key", keeping only the last 4 characters', async () => {
    selectResolves = { data: [{ key: 'anthropic_api_key', value: 'sk-ant-abcdef1234' }], error: null }
    const res = await GET()
    const json = await res.json()
    expect(json[0].value).toBe('••••••••1234')
  })

  it('does not mask a key that does not end in "_key" (e.g. active_provider)', async () => {
    selectResolves = { data: [{ key: 'active_provider', value: 'both' }], error: null }
    const res = await GET()
    const json = await res.json()
    expect(json[0].value).toBe('both')
  })

  it('reports hasValue: false for an empty stored key, without crashing on the mask', async () => {
    selectResolves = { data: [{ key: 'openai_api_key', value: '' }], error: null }
    const res = await GET()
    const json = await res.json()
    expect(json[0].hasValue).toBe(false)
    expect(json[0].value).toBe('')
  })

  it('returns a 500 with the db error message on a select failure', async () => {
    selectResolves = { data: null, error: { message: 'db unreachable' } }
    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('db unreachable')
  })
})

describe('POST /api/settings', () => {
  it('upserts a real, allowed key with a fresh updated_at', async () => {
    const res = await POST(postRequest({ anthropic_api_key: 'sk-ant-real-value' }))
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [rows] = upsertMock.mock.calls[0]
    expect(rows).toEqual([{ key: 'anthropic_api_key', value: 'sk-ant-real-value', updated_at: expect.any(String) }])
  })

  it('REGRESSION: never writes a masked placeholder back as the real key value (would permanently corrupt the stored secret)', async () => {
    const res = await POST(postRequest({ anthropic_api_key: '••••••••1234' }))
    expect(res.status).toBe(200)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('ignores a key that is not in the allowed list, instead of writing arbitrary settings', async () => {
    const res = await POST(postRequest({ some_other_key: 'value', active_provider: 'openai' }))
    expect(res.status).toBe(200)
    const [rows] = upsertMock.mock.calls[0]
    expect(rows).toEqual([{ key: 'active_provider', value: 'openai', updated_at: expect.any(String) }])
  })

  it('skips the upsert entirely when the body has no real updates', async () => {
    const res = await POST(postRequest({ anthropic_api_key: '••••••••1234' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('returns a 500 with the db error message on an upsert failure', async () => {
    upsertResolves = { error: { message: 'upsert failed' } }
    const res = await POST(postRequest({ active_provider: 'anthropic' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('upsert failed')
  })
})
