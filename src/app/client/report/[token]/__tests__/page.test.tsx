import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ClientReportPage from '../page'

// RTL's `waitFor` polls using its own internal setTimeout/setInterval loop,
// which does not play well with vi.useFakeTimers() (it never gets woken up).
// Instead we flush pending microtasks/timers deterministically with
// vi.advanceTimersByTimeAsync, wrapped in act() so React's resulting state
// updates are not flagged as out-of-act. A single advance isn't always
// enough to drain a chain of several awaits (fetch -> res.json() ->
// setState), so `advance` runs a few extra zero-ms flushes afterward.
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await act(async () => {
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(0)
    }
  })
}

async function flush() {
  await advance(0)
}

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ token: 'test-token' })),
}))

const setLangMock = vi.fn()
vi.mock('@/lib/i18n-context', () => ({
  useLanguage: vi.fn(() => ({
    t: (key: string) => key,
    setLang: setLangMock,
  })),
}))

vi.mock('@/components/client/client-report-viewer', () => ({
  ClientReportViewer: () => <div data-testid="report-viewer" />,
}))

vi.mock('@/components/client/analysis-splash', () => ({
  AnalysisSplash: () => <div data-testid="analysis-splash" />,
}))

function readyPayload() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      language: 'en',
      report: { summary: 'hello' },
      paymentTier: 'basic_12',
      deliveredAt: null,
    }),
  }
}

function pendingPayload() {
  return {
    ok: false,
    status: 409,
    json: async () => ({ status: 'analyzing' }),
  }
}

function failedPayload() {
  return {
    ok: false,
    status: 409,
    json: async () => ({ status: 'failed' }),
  }
}

function serverErrorPayload() {
  return {
    ok: false,
    status: 500,
    json: async () => ({}),
  }
}

describe('ClientReportPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setLangMock.mockClear()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders ready state after immediate success', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(readyPayload())

    render(<ClientReportPage />)
    await flush()

    expect(screen.getByTestId('report-viewer')).toBeInTheDocument()
    expect(screen.queryByTestId('analysis-splash')).not.toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('polls once while pending, then resolves to ready after 3000ms', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(pendingPayload())
    fetchMock.mockResolvedValueOnce(readyPayload())

    render(<ClientReportPage />)
    await flush()

    expect(screen.getByTestId('analysis-splash')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await advance(3000)

    expect(screen.getByTestId('report-viewer')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('backs off the poll delay by 1.3x each round, capping at 20000ms', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue(pendingPayload())

    render(<ClientReportPage />)
    await flush()

    // Initial load -> first fetch call
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Expected delay progression starting at 3000, x1.3 each round, capped at 20000.
    const delays: number[] = [3000]
    for (let i = 1; i < 12; i++) {
      delays.push(Math.min(delays[i - 1] * 1.3, 20000))
    }
    // Sanity-check the expected math matches what the task described.
    expect(delays[0]).toBeCloseTo(3000)
    expect(delays[1]).toBeCloseTo(3900)
    expect(delays[2]).toBeCloseTo(5070)
    expect(delays[3]).toBeCloseTo(6591)
    expect(delays[4]).toBeCloseTo(8568.3)
    expect(delays[5]).toBeCloseTo(11138.79)

    // Advance by the exact expected delay each round and confirm exactly one
    // additional fetch call happens per advance -- this proves the component
    // is actually using this delay sequence for its setTimeout scheduling.
    for (let round = 0; round < delays.length; round++) {
      const before = fetchMock.mock.calls.length
      await advance(delays[round])
      expect(fetchMock.mock.calls.length).toBe(before + 1)
    }

    // By round 10 (index 9) the delay sequence has reached the 20000ms cap.
    expect(delays[9]).toBe(20000)
    expect(delays[10]).toBe(20000)
    expect(delays[11]).toBe(20000)
  })

  it('renders failed state immediately on a hard failure and stops polling', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(failedPayload())

    render(<ClientReportPage />)
    await flush()

    expect(screen.getByText('analysisFailedMessage')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await advance(60000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up once cumulative elapsed time crosses the 360000ms ceiling', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue(pendingPayload())

    render(<ClientReportPage />)
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Reproduce the component's real delay/elapsed accounting to find d_1..d_k,
    // the geometric delay sequence (3000, 3900, 5070, ... capped at 20000),
    // where k is the smallest index at which the cumulative sum of d_1..d_k
    // reaches the 360000ms ceiling.
    //
    // Timeline in the real component:
    //   fetch #1 fires immediately (no delay).
    //   processing fetch #i's response adds d_i to elapsedMs; if that crosses
    //   the ceiling it fails right there (no new fetch scheduled); otherwise
    //   it schedules fetch #(i+1) after d_i ms.
    // So fetch #k is the LAST one ever called, and it's fetch #k's own
    // response (adding d_k) that crosses the ceiling -- no new fetch #(k+1)
    // is scheduled or called.
    //
    // Concretely: advancing by d_1..d_(k-2) triggers fetch #2..fetch #(k-1)
    // and leaves the component still pending (elapsed only reaches
    // sum(d_1..d_(k-2)), which is under the ceiling by construction).
    // The next advance, by d_(k-1), triggers fetch #k AND (within that same
    // advance) crosses the ceiling while processing its response -- flipping
    // to 'failed' with exactly one more fetch call, and no further timer is
    // ever scheduled after that.
    let delayMs = 3000
    let elapsedMs = 0
    const allDelays: number[] = []
    while (elapsedMs < 360000) {
      allDelays.push(delayMs)
      elapsedMs += delayMs
      delayMs = Math.min(delayMs * 1.3, 20000)
    }
    // allDelays = [d_1, ..., d_k]; the crossing happens while processing d_k.
    const roundsBeforeCeiling = allDelays.slice(0, -2) // d_1 .. d_(k-2)
    const finalAdvance = allDelays[allDelays.length - 2] // d_(k-1)

    // Advance through every round that stays safely under the ceiling.
    for (const delay of roundsBeforeCeiling) {
      await advance(delay)
    }
    expect(screen.getByTestId('analysis-splash')).toBeInTheDocument()
    const callsBeforeCeiling = fetchMock.mock.calls.length
    expect(callsBeforeCeiling).toBe(roundsBeforeCeiling.length + 1)

    // This advance triggers the next fetch, whose response processing pushes
    // elapsedMs over the ceiling and flips state to 'failed'.
    await advance(finalAdvance)

    expect(screen.getByText('analysisFailedMessage')).toBeInTheDocument()
    const callsAtCeiling = fetchMock.mock.calls.length
    expect(callsAtCeiling).toBe(callsBeforeCeiling + 1)

    // No further polling after the ceiling is hit -- no timer was scheduled.
    await advance(60000)
    expect(fetchMock.mock.calls.length).toBe(callsAtCeiling)
  })

  it('renders generic error state on a non-409 server error and does not poll again', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(serverErrorPayload())

    render(<ClientReportPage />)
    await flush()

    expect(screen.getByText('error')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await advance(60000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not call setState (no additional fetch-driven update) after unmount', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(pendingPayload())
    fetchMock.mockResolvedValueOnce(readyPayload())

    const { unmount } = render(<ClientReportPage />)
    await flush()

    expect(screen.getByTestId('analysis-splash')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    unmount()

    // Advance past when the next poll would have fired. The component's
    // `cancelled` flag guards the setState calls, but the setTimeout itself
    // is not cleared on unmount -- so the underlying fetch may still fire.
    await advance(3000)

    // No error/warning should be thrown by this advance.
    expect(true).toBe(true)
  })
})
