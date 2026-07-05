import { describe, it, expect, vi, beforeEach } from 'vitest'

let waitUntilPromise: Promise<unknown> | null = null
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    waitUntilPromise = p
  },
}))

const mockCompare = vi.fn()
vi.mock('@/lib/claude/compare', () => ({
  compareIris: (...args: unknown[]) => mockCompare(...args),
}))

function chain(finalResult: any): any {
  const c: any = {
    eq: () => c,
    select: () => c,
    single: () => Promise.resolve(finalResult),
  }
  return c
}

const updateMock = vi.fn()
let updateResolves: any = { data: { status: 'analyzing' }, error: null }

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'sessions') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'session-1' }, error: null }) }) }),
          update: (...args: unknown[]) => {
            updateMock(...args)
            return chain(updateResolves)
          },
        }
      }
      if (table === 'reports') {
        return { insert: () => Promise.resolve({ data: null, error: null }) }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

import { POST } from '../route'

function makeRequest() {
  return new Request('http://test', {
    method: 'POST',
    body: JSON.stringify({
      patientId: 'p1',
      previousRightIrisBase64: 'a',
      previousLeftIrisBase64: 'b',
      rightIrisBase64: 'c',
      leftIrisBase64: 'd',
      patientData: { symptoms: '', practitioner_notes: '' },
    }),
  }) as never
}

describe('POST /api/compare', () => {
  beforeEach(() => {
    waitUntilPromise = null
    updateMock.mockClear()
    mockCompare.mockReset()
    updateResolves = { data: { status: 'analyzing' }, error: null }
  })

  it('completes normally, guarding the terminal write with status=analyzing', async () => {
    mockCompare.mockResolvedValue({ comp_1_improvements: 'x', comp_2_not_improved: 'y' })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(updateMock.mock.calls.find(([arg]) => arg.status === 'completed')).toBeTruthy()
  })

  it('is a silent no-op when the terminal CAS finds 0 rows (status already settled)', async () => {
    mockCompare.mockResolvedValue({ comp_1_improvements: 'x', comp_2_not_improved: 'y' })
    updateResolves = { data: null, error: null }
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await expect(waitUntilPromise).resolves.toBeUndefined()
  })

  it('writes an error status (guarded) when compareIris returns an error code', async () => {
    mockCompare.mockResolvedValue({ code: 'BOOM', message: 'bad' })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    await waitUntilPromise

    expect(updateMock.mock.calls.find(([arg]) => arg.status === 'error')).toBeTruthy()
  })
})
