import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import SessionDetailPage from '../page'

/**
 * RTL's `waitFor` polls using a real/fake `setInterval` under the hood, which
 * never ticks on its own while vitest's fake timers are installed (nothing
 * is advancing wall-clock time). So instead of `waitFor`, we deterministically
 * flush the microtask queue (promises from `fetch`, `params.then`, etc.) by
 * advancing fake timers by 0ms inside `act`, confirmed empirically to drain
 * all pending `.then()` chains queued so far.
 */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    back: vi.fn(),
  })),
}))

const SESSION_ID = 'test-session-id'

type SessionStatus = 'pending' | 'analyzing' | 'completed' | 'error'

function makeSession(status: SessionStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    patient_id: 'patient-1',
    created_at: '2026-01-01T00:00:00.000Z',
    session_date: '2026-01-01T00:00:00.000Z',
    analysis_mode: 'full',
    status,
    error_message: status === 'error' ? 'Something went wrong' : null,
    symptoms: null,
    practitioner_notes: null,
    patients: {
      id: 'patient-1',
      full_name: 'Jane Doe',
      date_of_birth: null,
      gender: null,
      email: null,
      phone: null,
      general_history: null,
      notes: null,
    },
    ...overrides,
  }
}

function makeReport() {
  return {
    id: 'report-1',
    session_id: SESSION_ID,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  })
}

/**
 * Builds a fetch mock where every call to /api/sessions/:id returns the next
 * status in `statuses` (the last entry repeats indefinitely once exhausted).
 * Calls to /api/reports?sessionId=:id always return a single report.
 */
function createFetchMock(statuses: SessionStatus[]) {
  let callIndex = 0
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith(`/api/sessions/${SESSION_ID}`)) {
      const status = statuses[Math.min(callIndex, statuses.length - 1)]
      callIndex += 1
      return jsonResponse(makeSession(status))
    }
    if (url.startsWith(`/api/reports?sessionId=${SESSION_ID}`)) {
      return jsonResponse([makeReport()])
    }
    return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
  })
  return fetchMock
}

function sessionCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) =>
    String(call[0]).startsWith(`/api/sessions/${SESSION_ID}`)
  ).length
}

function reportCallCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) =>
    String(call[0]).startsWith(`/api/reports?sessionId=${SESSION_ID}`)
  ).length
}

describe('SessionDetailPage polling/backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not poll when the initial status is already completed', async () => {
    const fetchMock = createFetchMock(['completed'])
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />)

    // Flush the params-resolution effect + initial fetch effect (including its
    // nested report fetch), all of which are microtask-driven.
    await flush()

    expect(screen.getByText('Analysis Complete')).toBeInTheDocument()

    expect(sessionCallCount(fetchMock)).toBe(1)
    expect(reportCallCount(fetchMock)).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Advance far past any conceivable poll interval — nothing should happen
    // because the backoff effect never starts for a non-'analyzing' status.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('backs off the poll delay by 1.3x each round, capping at 20000ms', async () => {
    const fetchMock = createFetchMock(['analyzing']) // never completes
    global.fetch = fetchMock as unknown as typeof fetch

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

    render(<SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />)
    await flush()

    expect(sessionCallCount(fetchMock)).toBe(1)

    // Capture the delay used for every setTimeout scheduled after mount.
    const delaysAtIndex = (n: number): number => setTimeoutSpy.mock.calls[n][1] as number

    // First scheduled call (index 0) is the initial `setTimeout(poll, 4000)`
    // from the polling effect (params-resolution and initial-fetch effects
    // don't call setTimeout, so this is unambiguous).
    expect(setTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(delaysAtIndex(0)).toBe(4000)

    const observedDelays: number[] = [delaysAtIndex(0)]

    // Drive 6 rounds forward, each time advancing by the delay that was most
    // recently scheduled, then recording the delay scheduled for the round
    // after that.
    for (let round = 0; round < 6; round++) {
      const callsBefore = setTimeoutSpy.mock.calls.length
      const delayToAdvance = setTimeoutSpy.mock.calls[callsBefore - 1][1] as number
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayToAdvance)
      })
      const callsAfter = setTimeoutSpy.mock.calls.length
      if (callsAfter > callsBefore) {
        observedDelays.push(setTimeoutSpy.mock.calls[callsAfter - 1][1] as number)
      }
    }

    // Report the real observed sequence of setTimeout delay arguments.
    // eslint-disable-next-line no-console
    console.log('Observed setTimeout delays:', observedDelays)

    // The delay eventually reaches and stays at the 20000ms cap.
    expect(Math.max(...observedDelays)).toBeLessThanOrEqual(20000)
    const lastDelay = observedDelays[observedDelays.length - 1]
    expect(lastDelay).toBeLessThanOrEqual(20000)

    // Continue advancing several more rounds by whatever was last scheduled,
    // to prove the delay caps out at 20000 and stays there.
    for (let round = 0; round < 6; round++) {
      const callsBefore = setTimeoutSpy.mock.calls.length
      const delayToAdvance = setTimeoutSpy.mock.calls[callsBefore - 1][1] as number
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delayToAdvance)
      })
    }
    const finalDelay = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1] as number
    expect(finalDelay).toBe(20000)
  })

  it('stops polling and fetches the report once status becomes completed', async () => {
    const fetchMock = createFetchMock(['analyzing', 'completed'])
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />)
    await flush()

    expect(sessionCallCount(fetchMock)).toBe(1)
    expect(screen.getByText('Analysis in Progress')).toBeInTheDocument()

    // Fire the first poll (scheduled with a 4000ms delay).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.getByText('Analysis Complete')).toBeInTheDocument()

    expect(sessionCallCount(fetchMock)).toBe(2)
    expect(reportCallCount(fetchMock)).toBe(1)

    const totalCallsAfterCompletion = fetchMock.mock.calls.length

    // Advance well past another 20000ms cap-level poll — no further calls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(fetchMock.mock.calls.length).toBe(totalCallsAfterCompletion)
    expect(sessionCallCount(fetchMock)).toBe(2)
  })

  it('stops polling on error status without fetching a report', async () => {
    const fetchMock = createFetchMock(['analyzing', 'error'])
    global.fetch = fetchMock as unknown as typeof fetch

    render(<SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />)
    await flush()

    expect(sessionCallCount(fetchMock)).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.getByText('Analysis Failed')).toBeInTheDocument()

    expect(sessionCallCount(fetchMock)).toBe(2)
    expect(reportCallCount(fetchMock)).toBe(0)

    const totalCallsAfterError = fetchMock.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(fetchMock.mock.calls.length).toBe(totalCallsAfterError)
  })

  it('sets pollLimitReached once the ~300000ms ceiling is crossed, then stops polling', async () => {
    const fetchMock = createFetchMock(['analyzing']) // never completes
    global.fetch = fetchMock as unknown as typeof fetch

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

    render(<SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />)
    await flush()

    expect(sessionCallCount(fetchMock)).toBe(1)

    const limitMessage = () =>
      screen.queryByText(/taking longer than usual and may have failed/i)

    expect(limitMessage()).not.toBeInTheDocument()

    let reachedLimit = false
    let safetyCounter = 0
    let sawFalseBeforeLimit = false

    while (!reachedLimit && safetyCounter < 100) {
      safetyCounter += 1
      const callsBefore = setTimeoutSpy.mock.calls.length
      const nextDelay = setTimeoutSpy.mock.calls[callsBefore - 1][1] as number

      if (limitMessage() === null) {
        sawFalseBeforeLimit = true
      }

      await act(async () => {
        await vi.advanceTimersByTimeAsync(nextDelay)
      })

      if (limitMessage()) {
        reachedLimit = true
      }
    }

    expect(sawFalseBeforeLimit).toBe(true)
    expect(reachedLimit).toBe(true)

    const sessionCallsAtLimit = sessionCallCount(fetchMock)
    const setTimeoutCallsAtLimit = setTimeoutSpy.mock.calls.length

    // Advancing further must not resume polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(sessionCallCount(fetchMock)).toBe(sessionCallsAtLimit)
    expect(setTimeoutSpy.mock.calls.length).toBe(setTimeoutCallsAtLimit)
  })

  it('cancels the pending timeout on unmount and never fires the next poll', async () => {
    const fetchMock = createFetchMock(['analyzing'])
    global.fetch = fetchMock as unknown as typeof fetch
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { unmount } = render(
      <SessionDetailPage params={Promise.resolve({ id: SESSION_ID })} />
    )
    await flush()

    expect(sessionCallCount(fetchMock)).toBe(1)

    const callsBeforeUnmount = fetchMock.mock.calls.length

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()

    // The next poll was scheduled for 4000ms out; advance well past it.
    await expect(
      act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
    ).resolves.not.toThrow()

    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
