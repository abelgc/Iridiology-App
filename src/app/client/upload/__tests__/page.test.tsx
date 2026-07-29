import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadPage from '../page'

const replaceMock = vi.fn()
let searchParamValues: Record<string, string> = { token: 'tok-123' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => searchParamValues[key] ?? null }),
}))

vi.mock('@/lib/i18n-context', () => ({
  useLanguage: () => ({ t: (key: string) => key, lang: 'en' }),
}))

// Stand-ins for the heavy children: the page's job under test is orchestration
// (what it POSTs, where it navigates, what it persists), not their internals.
vi.mock('@/components/client/upload-tutorial', () => ({
  UploadTutorial: () => <div data-testid="tutorial" />,
}))

vi.mock('@/components/client/iris-image-upload', () => ({
  IrisImageUpload: ({ onSubmit }: { onSubmit: (v: { right: string; left: string }) => void }) => (
    <button onClick={() => onSubmit({ right: 'data:image/jpeg;base64,R', left: 'data:image/jpeg;base64,L' })}>
      submit-photos
    </button>
  ),
}))

vi.mock('@/components/client/pre-analysis-video', () => ({
  PreAnalysisVideo: ({ onContinue }: { onContinue: () => void }) => (
    <div data-testid="video">
      <button onClick={onContinue}>video-done</button>
    </div>
  ),
}))

vi.mock('@/components/client/analysis-splash', () => ({
  AnalysisSplash: () => <div data-testid="splash" />,
}))

// The failure notice is now an in-page toast rather than a native alert — the alert
// froze the whole page, which is what "I pressed it and nothing happened" looked like
// from the customer's side. What is asserted is unchanged: the client is told, or
// deliberately is not.
const toastMock = vi.fn()

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock, dismiss: vi.fn(), toasts: [] }),
}))

beforeEach(() => {
  replaceMock.mockClear()
  toastMock.mockClear()
  searchParamValues = { token: 'tok-123' }
  window.sessionStorage.clear()
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  // Restore any sessionStorage spies even if a test bailed out early, so they can't
  // leak into the next test and make it pass or fail for the wrong reason.
  vi.restoreAllMocks()
  vi.useRealTimers()
})

type MockRes = { ok: boolean; status: number; body?: unknown }

function asResponse(res: MockRes) {
  return { ok: res.ok, status: res.status, json: async () => res.body ?? {} }
}

function mockUploadResponse(res: MockRes) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(asResponse(res))
}

// The page talks to two endpoints: POST /api/client/upload when the client submits, and
// GET /api/client/reports/{token} when a reload has to establish whether the analysis
// actually started. Route by URL so a test can pin each one independently.
function mockEndpoints(opts: {
  upload?: MockRes
  resume?: MockRes | 'network-error' | 'never-answers'
}) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    (url: string, init?: { signal?: AbortSignal }) => {
      if (typeof url === 'string' && url.startsWith('/api/client/reports/')) {
        const resume = opts.resume
        if (resume === 'network-error') return Promise.reject(new TypeError('Failed to fetch'))
        if (resume === 'never-answers') {
          // Hangs until (and unless) the page gives up and aborts it, exactly like a
          // request stuck on a dead connection.
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            )
          })
        }
        if (!resume) throw new Error(`unexpected resume check: ${url}`)
        return Promise.resolve(asResponse(resume))
      }
      if (!opts.upload) throw new Error(`unexpected upload POST: ${url}`)
      return Promise.resolve(asResponse(opts.upload))
    },
  )
}

// Drives the flow to the point where the upload POST has been dispatched and the stage is
// persisted, then throws the component tree away — i.e. the client reloaded mid-flow.
async function submitThenReload(user: ReturnType<typeof userEvent.setup>) {
  const first = render(<UploadPage />)
  await user.click(screen.getByText('submit-photos'))
  first.unmount()
  ;(global.fetch as ReturnType<typeof vi.fn>).mockClear()
  replaceMock.mockClear()
}

describe('client upload page', () => {
  it('REGRESSION (2026-07-26): a 409 already_processing sends the client to their report instead of alerting and dumping them back on the form', async () => {
    // The client reloaded, re-picked their photos and re-submitted. The row is already
    // 'analyzing', so the POST comes back 409. Old behaviour: alert('error') then back to
    // the upload form, with a perfectly good analysis running that they could never reach.
    mockUploadResponse({
      ok: false,
      status: 409,
      body: { error: 'already_processing', status: 'analyzing', report_download_token: 'tok-123' },
    })
    const user = userEvent.setup()
    render(<UploadPage />)

    await user.click(screen.getByText('submit-photos'))
    await user.click(screen.getByText('video-done'))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/client/report/tok-123'))
    expect(toastMock).not.toHaveBeenCalled()
    // The splash stays up through the navigation — the client is never shown the form again.
    // (The form markup always renders underneath it; the splash is a fixed-position overlay.)
    expect(screen.getByTestId('splash')).toBeInTheDocument()
  })

  it('REGRESSION (2026-07-26): a reload during the waiting video resumes to the report instead of resetting to the upload form', async () => {
    mockUploadResponse({ ok: true, status: 200, body: { report_download_token: 'tok-123' } })
    const user = userEvent.setup()
    const first = render(<UploadPage />)

    await user.click(screen.getByText('submit-photos'))
    expect(screen.getByTestId('video')).toBeInTheDocument()

    // The client reloads mid-video: component tree is torn down and rebuilt from scratch,
    // so `stage` and the in-flight-upload ref are both gone.
    first.unmount()
    replaceMock.mockClear()
    render(<UploadPage />)

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/client/report/tok-123'))
    expect(screen.getByTestId('splash')).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('does not inherit a different analysis\'s persisted stage — a fresh token starts on the form', async () => {
    mockUploadResponse({ ok: true, status: 200, body: { report_download_token: 'tok-123' } })
    const user = userEvent.setup()
    const first = render(<UploadPage />)
    await user.click(screen.getByText('submit-photos'))
    first.unmount()

    // Second analysis, same tab, different token.
    searchParamValues = { token: 'tok-999' }
    replaceMock.mockClear()
    render(<UploadPage />)

    expect(screen.getByText('submit-photos')).toBeInTheDocument()
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('still shows the error and returns to the form for a genuine failure, and clears the persisted stage so a later reload does not falsely resume', async () => {
    mockUploadResponse({ ok: false, status: 500, body: { error: 'boom' } })
    const user = userEvent.setup()
    const first = render(<UploadPage />)

    await user.click(screen.getByText('submit-photos'))
    await user.click(screen.getByText('video-done'))

    await waitFor(() =>
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: 'error' })),
  )
    expect(replaceMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()

    // A reload after that failure must land back on the form, not on a phantom splash.
    first.unmount()
    replaceMock.mockClear()
    render(<UploadPage />)
    expect(screen.getByText('submit-photos')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('survives sessionStorage throwing (private browsing) — the page still renders and the upload still completes', async () => {
    const boom = () => {
      throw new Error('SecurityError: sessionStorage is not available')
    }
    const storageProto = Object.getPrototypeOf(window.sessionStorage)
    vi.spyOn(storageProto, 'getItem').mockImplementation(boom)
    vi.spyOn(storageProto, 'setItem').mockImplementation(boom)
    vi.spyOn(storageProto, 'removeItem').mockImplementation(boom)
    // Guard against this test silently going vacuous if the spy ever stops applying.
    expect(() => window.sessionStorage.getItem('x')).toThrow()
    expect(() => window.sessionStorage.setItem('x', 'y')).toThrow()

    mockUploadResponse({ ok: true, status: 200, body: { report_download_token: 'tok-123' } })
    const user = userEvent.setup()
    render(<UploadPage />)

    expect(screen.getByText('submit-photos')).toBeInTheDocument()
    await user.click(screen.getByText('submit-photos'))
    await user.click(screen.getByText('video-done'))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/client/report/tok-123'))
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('REGRESSION (2026-07-26): a resume asks the server whether the analysis really started before committing to the report redirect', async () => {
    mockEndpoints({
      upload: { ok: true, status: 200, body: { report_download_token: 'tok-123' } },
      // The POST landed and stage 1 claimed the row: this really is under way.
      resume: { ok: false, status: 409, body: { error: 'not_ready', status: 'analyzing' } },
    })
    const user = userEvent.setup()
    await submitThenReload(user)

    render(<UploadPage />)

    // Blindly redirecting on the strength of sessionStorage alone is the bug: the redirect
    // has to be a consequence of what the server says, not of what the tab remembers.
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/client/reports/tok-123',
        expect.objectContaining({ signal: expect.anything() }),
      ),
    )
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/client/report/tok-123'))
    expect(screen.getByTestId('splash')).toBeInTheDocument()
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('REGRESSION (2026-07-26): a reload in the window before the upload POST left the machine returns to the form, not to a report that will never arrive', async () => {
    // The flow persists the moment the POST is *dispatched*, so a browser that dies in the
    // milliseconds before the request actually goes out leaves a row still at 'paid' and a
    // sessionStorage entry claiming the analysis is under way. Resuming to the report page
    // makes it poll a row that will never move and declare failure ~6 minutes later — worse
    // than the pre-persistence behaviour, where the client simply saw the form and re-sent.
    mockEndpoints({
      upload: { ok: true, status: 200, body: { report_download_token: 'tok-123' } },
      resume: { ok: false, status: 409, body: { error: 'not_ready', status: 'paid' } },
    })
    const user = userEvent.setup()
    await submitThenReload(user)

    render(<UploadPage />)

    await waitFor(() => expect(screen.queryByTestId('splash')).not.toBeInTheDocument())
    expect(screen.getByText('submit-photos')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalledWith('/client/report/tok-123')
    // And the stale entry is gone, so a later reload can't be misled by it all over again.
    expect(window.sessionStorage.getItem('client-upload-flow:tok-123')).toBeNull()
  })

  it('REGRESSION (2026-07-26): a resume check that fails (offline, 500) leaves the client on a usable form rather than a splash that never resolves', async () => {
    mockEndpoints({
      upload: { ok: true, status: 200, body: { report_download_token: 'tok-123' } },
      resume: 'network-error',
    })
    const user = userEvent.setup()
    await submitThenReload(user)

    render(<UploadPage />)

    // The form is the safe fallback when we can't tell: re-submitting an analysis that IS
    // running comes back 409 already_processing, which this page already turns into a
    // redirect to the report. The opposite mistake — parking a never-started client on the
    // report page — has no recovery at all.
    await waitFor(() => expect(screen.getByText('submit-photos')).toBeInTheDocument())
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalledWith('/client/report/tok-123')
    // The entry survives, though: we learned nothing, so a later reload on a working
    // connection should still get the chance to resume properly.
    expect(window.sessionStorage.getItem('client-upload-flow:tok-123')).not.toBeNull()
  })

  it('REGRESSION (2026-07-26): a resume check that never answers gives up and shows the form instead of holding the splash forever', async () => {
    mockEndpoints({
      upload: { ok: true, status: 200, body: { report_download_token: 'tok-123' } },
      resume: 'never-answers',
    })
    const user = userEvent.setup()
    await submitThenReload(user)

    // A rejecting fetch is the easy case; a request that simply hangs (dead wifi, captive
    // portal) is the one that can strand a client on the splash with nothing to break it.
    vi.useFakeTimers()
    render(<UploadPage />)
    expect(screen.getByTestId('splash')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })

    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
    expect(screen.getByText('submit-photos')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalledWith('/client/report/tok-123')
  })
})
