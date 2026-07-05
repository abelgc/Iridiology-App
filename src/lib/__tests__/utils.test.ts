import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withTimeout } from '../utils'

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rejects with the given message after ms elapses if the wrapped promise never settles', async () => {
    const never = new Promise(() => {})
    const result = withTimeout(never, 1000, 'timed out')
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it("resolves with the wrapped promise's value when it settles before the timeout", async () => {
    const fast = Promise.resolve('ok')
    const result = withTimeout(fast, 1000, 'timed out')
    await vi.advanceTimersByTimeAsync(10)
    await expect(result).resolves.toBe('ok')
  })

  it("propagates the wrapped promise's own rejection, not the timeout message", async () => {
    const failing = Promise.reject(new Error('upstream failure'))
    await expect(withTimeout(failing, 1000, 'timed out')).rejects.toThrow('upstream failure')
  })

  it('clears the timer once the wrapped promise settles, so it does not leak', async () => {
    const fast = Promise.resolve('ok')
    await withTimeout(fast, 1000, 'timed out').catch(() => {})
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the timer once the timeout itself fires, so it does not leak', async () => {
    const never = new Promise(() => {})
    const result = withTimeout(never, 1000, 'timed out').catch(() => {})
    await vi.advanceTimersByTimeAsync(1000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})
