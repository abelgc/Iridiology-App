import { describe, it, expect, vi, beforeEach } from 'vitest'

const logAppErrorMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/error-log', () => ({
  logAppError: (...args: unknown[]) => logAppErrorMock(...args),
}))

import { POST } from '../route'

function req(body?: unknown, opts: { raw?: string } = {}): Request {
  const payload = opts.raw ?? JSON.stringify(body)
  return new Request('https://narasimhasolutions.com/api/client/internal/log-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  })
}

beforeEach(() => {
  logAppErrorMock.mockClear()
})

describe('POST /api/client/internal/log-error', () => {
  it('logs a client error and returns ok', async () => {
    const res = await POST(req({ message: 'boom', stack: 'at x', context: { url: '/foo' } }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(logAppErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'client', route: null, message: 'boom', stack: 'at x' }),
    )
  })

  it('accepts a message with no stack or context', async () => {
    const res = await POST(req({ message: 'boom' }))

    expect(res.status).toBe(200)
    expect(logAppErrorMock).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom', stack: null, context: null }))
  })

  it('rejects invalid JSON', async () => {
    const res = await POST(req(undefined, { raw: 'not json' }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })

  it('rejects a missing message', async () => {
    const res = await POST(req({ stack: 'x' }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })

  it('rejects a message over 2000 chars', async () => {
    const res = await POST(req({ message: 'x'.repeat(2001) }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })

  it('rejects a stack over 8000 chars', async () => {
    const res = await POST(req({ message: 'ok', stack: 'x'.repeat(8001) }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized body', async () => {
    const res = await POST(req(undefined, { raw: JSON.stringify({ message: 'ok', context: { blob: 'x'.repeat(30_000) } }) }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })

  it('rejects a non-object body', async () => {
    const res = await POST(req(undefined, { raw: '"just a string"' }))

    expect(res.status).toBe(400)
    expect(logAppErrorMock).not.toHaveBeenCalled()
  })
})
