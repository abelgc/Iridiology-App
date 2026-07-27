import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.CRON_SECRET = 'test-cron-secret'

// A recorded call: which table, and every builder method applied to it. The responder
// below reads these to decide what a given query is asking for, which keeps the stub
// honest — if the route changes its query shape, the stub stops matching and the test
// fails rather than silently returning the old answer.
type Query = { table: string; ops: Array<[string, unknown[]]> }

const BUILDER_METHODS = ['select', 'eq', 'gte', 'lte', 'lt', 'in', 'order', 'limit', 'upsert'] as const

let queries: Query[] = []
let respond: (q: Query) => unknown

function createStubClient() {
  return {
    from(table: string) {
      const query: Query = { table, ops: [] }
      queries.push(query)
      const builder: Record<string, unknown> = {}
      for (const method of BUILDER_METHODS) {
        builder[method] = (...args: unknown[]) => {
          query.ops.push([method, args])
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => respond(query))
          .then(resolve, reject)
      return builder
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => createStubClient()),
}))

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/client/pdf', () => ({
  generateReportPdf: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { generateReportPdf } from '@/lib/client/pdf'
import { GET, MIN_PDF_BYTES, HEALTH_CHECK_SETTING_KEY } from '../route'

// ---------------------------------------------------------------------------
// Database state the stub answers from. Every field defaults to "healthy".
// ---------------------------------------------------------------------------
type State = {
  failedEmails: { count: number; latestReason: string | null }
  deliveredAnalyses: string[] // completed + delivered, inside the alert window
  emailLoggedIds: string[] // of those, the ones that do have an email_send_log row
  analysisCounts: Record<string, number> // `${status}:${recent|old}`
  preExistingFailedEmails: number
  error: { table: string; message: string } | null
}

let state: State

function freshState(): State {
  return {
    failedEmails: { count: 0, latestReason: null },
    deliveredAnalyses: [],
    emailLoggedIds: [],
    analysisCounts: {},
    preExistingFailedEmails: 0,
    error: null,
  }
}

function defaultResponder(q: Query): unknown {
  const op = (name: string) => q.ops.find(([n]) => n === name)

  if (state.error && state.error.table === q.table) {
    return { data: null, count: null, error: { message: state.error.message } }
  }

  if (q.table === 'settings') {
    return { data: null, error: null }
  }

  if (q.table === 'email_send_log') {
    const columns = op('select')?.[1][0] as string
    // Head count of failed sends older than the window — the pre-existing backlog.
    if (columns === '*') return { count: state.preExistingFailedEmails, error: null }
    // Which of the delivered analyses have a log row at all.
    if (op('in')) {
      return { data: state.emailLoggedIds.map((analysis_id) => ({ analysis_id })), error: null }
    }
    // Recent failures, most recent first, limit 1.
    return {
      data:
        state.failedEmails.count > 0
          ? [{ sent_at: '2026-07-27T09:00:00.000Z', error_message: state.failedEmails.latestReason, recipient_email: 'someone@example.com' }]
          : [],
      count: state.failedEmails.count,
      error: null,
    }
  }

  // client_analyses
  const columns = op('select')?.[1][0] as string
  if (columns === 'id') {
    return { data: state.deliveredAnalyses.map((id) => ({ id })), error: null }
  }

  const status = op('eq')?.[1][1] as string
  // A `gte` lower bound is what makes a count "inside the alert window"; without it the
  // route is asking for pre-existing damage, which must never alert.
  const bucket = op('gte') ? 'recent' : 'old'
  return { count: state.analysisCounts[`${status}:${bucket}`] ?? 0, error: null }
}

function healthyPdf(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(MIN_PDF_BYTES, 0x41)])
}

function request(authHeader?: string): Request {
  return new Request('https://narasimhasolutions.com/api/client/internal/health', {
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  queries = []
  state = freshState()
  respond = defaultResponder
  vi.mocked(Sentry.captureMessage).mockReset()
  vi.mocked(generateReportPdf).mockReset().mockResolvedValue(healthyPdf())
})

describe('GET /api/client/internal/health — authentication', () => {
  it('rejects a request with no Authorization header and runs no check', async () => {
    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(queries).toHaveLength(0)
    expect(generateReportPdf).not.toHaveBeenCalled()
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('rejects a request whose bearer token is wrong', async () => {
    const res = await GET(request('Bearer not-the-secret'))

    expect(res.status).toBe(401)
    expect(queries).toHaveLength(0)
  })

  it('fails closed when CRON_SECRET is unset — an unset secret authorises nobody', async () => {
    delete process.env.CRON_SECRET

    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer undefined'))).status).toBe(401)
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(queries).toHaveLength(0)
  })
})

describe('GET /api/client/internal/health — healthy system', () => {
  it('returns a summary of every check and alerts nobody', async () => {
    const res = await GET(request('Bearer test-cron-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.problems).toEqual([])
    expect(body.checks.email).toMatchObject({ ok: true, failedSends: 0, deliveredWithoutLog: 0 })
    expect(body.checks.stalled).toMatchObject({ ok: true, count: 0 })
    expect(body.checks.paid).toMatchObject({ ok: true, count: 0 })
    expect(body.checks.pdf).toMatchObject({ ok: true, header: '%PDF' })
    expect(body.checks.liveness.ok).toBe(true)
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('stamps the cron liveness timestamp into settings on every run', async () => {
    await GET(request('Bearer test-cron-secret'))

    const upsert = queries.find((q) => q.table === 'settings')?.ops.find(([n]) => n === 'upsert')
    expect(upsert).toBeDefined()
    const [payload] = upsert![1] as [{ key: string; value: string }]
    expect(payload.key).toBe(HEALTH_CHECK_SETTING_KEY)
    expect(Date.parse(payload.value)).not.toBeNaN()
  })
})

describe('GET /api/client/internal/health — failing checks', () => {
  it('reports failed report emails with the reason, which is what the 21-day outage needed', async () => {
    state.failedEmails = { count: 2, latestReason: 'domain not verified' }

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.ok).toBe(false)
    expect(body.checks.email).toMatchObject({ ok: false, failedSends: 2, latestFailure: 'domain not verified' })
    expect(body.problems).toHaveLength(1)
    expect(body.problems[0]).toContain('2 report email(s) failed to send')
    expect(body.problems[0]).toContain('domain not verified')
    expect(Sentry.captureMessage).toHaveBeenCalledWith(body.problems[0], 'error')
  })

  it('reports a delivered report that has no email_send_log row at all', async () => {
    state.deliveredAnalyses = ['a-1', 'a-2', 'a-3']
    state.emailLoggedIds = ['a-2']

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.checks.email).toMatchObject({ ok: false, deliveredWithoutLog: 2 })
    expect(body.problems[0]).toContain('2 report(s) marked delivered')
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1)
  })

  it('counts stalled analyses across both processing states and names them', async () => {
    state.analysisCounts = { 'analyzing:recent': 1, 'stage2_processing:recent': 2 }

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.checks.stalled).toMatchObject({ ok: false, count: 3, analyzing: 1, stage2Processing: 2 })
    expect(body.problems[0]).toContain('3 analysis/analyses stalled')
    expect(body.problems[0]).toContain('analyzing: 1')
    expect(body.problems[0]).toContain('stage2_processing: 2')
  })

  it('reports paid analyses that shipped nothing', async () => {
    state.analysisCounts = { 'paid:recent': 4 }

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.checks.paid).toMatchObject({ ok: false, count: 4 })
    expect(body.problems[0]).toContain('4 paid analysis/analyses have shipped nothing')
  })

  it('fails the PDF check when the render is too small to contain the fonts and logo', async () => {
    vi.mocked(generateReportPdf).mockResolvedValue(Buffer.from('%PDF-1.7 tiny', 'latin1'))

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.checks.pdf.ok).toBe(false)
    expect(body.problems[0]).toContain('report PDF is broken in this deployment')
    expect(Sentry.captureMessage).toHaveBeenCalledWith(body.problems[0], 'error')
  })

  it('fails the PDF check when the render is not a PDF at all', async () => {
    vi.mocked(generateReportPdf).mockResolvedValue(Buffer.alloc(MIN_PDF_BYTES + 10, 0x41))

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.checks.pdf).toMatchObject({ ok: false, header: 'AAAA' })
    expect(body.problems).toHaveLength(1)
  })

  it('raises one alert per failing check when several trip at once', async () => {
    state.failedEmails = { count: 1, latestReason: 'rate limited' }
    state.analysisCounts = { 'stage2_processing:recent': 2, 'paid:recent': 1 }
    vi.mocked(generateReportPdf).mockRejectedValue(new Error('ENOENT public/fonts/DMSans-Regular.ttf'))

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.ok).toBe(false)
    expect(body.problems).toHaveLength(4)
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(4)
    // A check that throws is itself reported — a blind health check is the state this
    // route exists to end.
    expect(body.problems.some((p: string) => p.includes('pdf_render') && p.includes('ENOENT'))).toBe(true)
  })

  it('keeps running the other checks when one query fails', async () => {
    state.error = { table: 'settings', message: 'permission denied' }

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.ok).toBe(false)
    expect(body.checks.liveness).toMatchObject({ ok: false, error: 'permission denied' })
    // The reporting checks still ran and still answered.
    expect(body.checks.email.ok).toBe(true)
    expect(body.checks.pdf.ok).toBe(true)
  })
})

describe('GET /api/client/internal/health — pre-existing damage', () => {
  it('counts damage older than the alert window but never alerts on it', async () => {
    // The state of production the day this shipped: 7 corpses in stage2_processing, 5
    // paid-and-never-delivered rows and 8 failed sends, all days old and all beyond the
    // sweep's reach. Alerting on these every hour forever would train a human to ignore
    // the alarm before it ever caught something new.
    state.analysisCounts = { 'stage2_processing:old': 7, 'paid:old': 5 }
    state.preExistingFailedEmails = 8

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.ok).toBe(true)
    expect(body.problems).toEqual([])
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
    expect(body.preExisting).toEqual({ failedSends: 8, stalled: 7, paidUndelivered: 5 })
  })

  it('still alerts on new damage while a pre-existing backlog sits there', async () => {
    state.analysisCounts = { 'stage2_processing:old': 7, 'stage2_processing:recent': 1 }

    const body = await (await GET(request('Bearer test-cron-secret'))).json()

    expect(body.ok).toBe(false)
    expect(body.problems).toHaveLength(1)
    expect(body.problems[0]).toContain('1 analysis/analyses stalled')
    expect(body.preExisting.stalled).toBe(7)
  })
})
