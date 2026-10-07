import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'
import { createFakeDb, type FakeDb } from './fake-supabase'
import { describeCalls, startAiReplay, type ReplayOptions, type ReplaySession, type ServedCall } from './replay'
import type { Lang } from './types'

// Offline end-to-end run of the paid client flow, through the real route handlers:
//   POST /api/client/upload  ->  stage 1 (analyzeIrisDual) in waitUntil
//   -> triggerStage2's fetch, answered in-process by POST /api/client/internal/stage2
//   -> stage 2 (Jyotish + rewriteReportForClient) in waitUntil
//   -> GET /api/client/reports/[token], what the client's polling page receives.
// Model replies come from the replay (real recordings); Supabase is an in-memory double
// (fake-supabase.ts). The intake row has no email, so stage 2 ends without PDF/email (those
// run after the report is stored and are not model calls).
//
// A test file using this needs, at top level (vi.mock is hoisted only there):
//   vi.mock('@/lib/supabase/server', async () => (await import('@/test/ai-replay/client-pipeline')).supabaseServerMock())
//   vi.mock('@vercel/functions', async () => (await import('@/test/ai-replay/client-pipeline')).vercelFunctionsMock())

type Row = Record<string, unknown>

const INTERNAL_SECRET = 'replay-internal-trigger-secret'
const IRIS = path.resolve(process.cwd(), 'e2e/fixtures/face-eye-left.jpg')

// Fictional intake, same as the real-AI suite that made the recordings (names scrubbed to Ana).
const COMPLAINT: Record<Lang, string> = {
  es: 'Cansancio constante, hinchazón después de comer y dificultad para dormir.',
  en: 'Constant tiredness, bloating after meals and trouble sleeping.',
  de: 'Ständige Müdigkeit, Blähungen nach dem Essen und Schlafprobleme.',
}

let db: FakeDb = createFakeDb()
const background = new Set<Promise<unknown>>()

export function supabaseServerMock() {
  return {
    createAdminClient: () => db,
    createClient: async () => db,
  }
}

export function vercelFunctionsMock() {
  return {
    waitUntil: (promise: Promise<unknown>) => {
      background.add(promise)
    },
  }
}

/** Waits for every waitUntil task, including the ones they start. Advances fake timers if on. */
async function drain(): Promise<void> {
  const started = Date.now()
  while (background.size) {
    const batch = [...background]
    background.clear()
    let settled = false
    const all = Promise.allSettled(batch).then(() => {
      settled = true
    })
    if (vi.isFakeTimers()) {
      while (!settled) {
        await vi.advanceTimersByTimeAsync(1_000)
        if (Date.now() - started > 60 * 60_000) throw new Error('[client-pipeline] background work still running after 1h of fake time')
      }
    }
    await all
  }
}

function irisDataUrl(): string {
  return `data:image/jpeg;base64,${readFileSync(IRIS).toString('base64')}`
}

export interface ClientRunOptions extends ReplayOptions {
  lang: Lang
  tier?: 'premium_2990' | 'basic_1990'
  /** Overrides on the seeded client_analyses row. */
  row?: Row
}

export interface ClientView {
  status: number
  body: Record<string, unknown>
}

export interface ClientRun {
  upload: ClientView
  /** GET /api/client/reports/[token] once all background work has settled. */
  clientView: ClientView
  row: Row
  db: FakeDb
  replay: ReplaySession
  calls: ServedCall[]
  /** console.error lines the routes logged (they are captured, not printed). */
  errors: string[]
  /** Model calls, the row's status / failure_reason and the routes' errors, for assertion messages. */
  explain(): string
  /** Polls again, optionally after `advanceMs` of (fake) time, and settles what the poll started. */
  poll(advanceMs?: number): Promise<ClientView>
}

async function withInternalRoutes<T>(fn: () => Promise<T>): Promise<T> {
  const outer = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (new URL(url).pathname === '/api/client/internal/stage2') {
      const { POST } = await import('@/app/api/client/internal/stage2/route')
      return POST(new Request(url, init) as never)
    }
    return outer(input, init)
  }) as typeof fetch
  try {
    return await fn()
  } finally {
    globalThis.fetch = outer
  }
}

async function getClientView(token: string): Promise<ClientView> {
  const { GET } = await import('@/app/api/client/reports/[token]/route')
  const res = await GET(new Request(`http://test/api/client/reports/${token}`) as never, { params: Promise.resolve({ token }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

export async function runClientPipeline(options: ClientRunOptions): Promise<ClientRun> {
  const { lang, tier = 'premium_2990', row: rowOverrides, ...replayOptions } = options
  const token = randomUUID()
  process.env.INTERNAL_TRIGGER_SECRET = INTERNAL_SECRET
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_URL

  db = createFakeDb({
    settings: [
      { key: 'active_provider', value: 'both' },
      { key: 'anthropic_api_key', value: 'replay-anthropic-key' },
      { key: 'openai_api_key', value: 'replay-openai-key' },
    ],
    client_analyses: [
      {
        id: randomUUID(),
        report_download_token: token,
        status: 'paid',
        language: lang,
        payment_tier: tier,
        full_name: 'Ana Example',
        email: null,
        date_of_birth: '1984-03-15',
        country_of_birth: 'Spain',
        city_of_birth: 'Valencia',
        time_of_day: 'morning',
        main_complaint: COMPLAINT[lang],
        current_medications: null,
        health_questionnaire: {
          digestive: { bloating: true, constipation: true },
          nervous: { insomnia: true, chronic_stress: true },
          endocrine: { excessive_fatigue: true },
        },
        report_id: null,
        analyzing_started_at: null,
        stage2_started_at: null,
        stage2_retry_count: 0,
        report_delivered_at: null,
        failure_reason: null,
        ...rowOverrides,
      },
    ],
  })
  background.clear()
  const replay = startAiReplay({ lang, ...replayOptions })
  const errors: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').replace(/\x1b\[\d+m/g, ''))
  })

  const run = () =>
    withInternalRoutes(async () => {
      const { POST } = await import('@/app/api/client/upload/route')
      const image = irisDataUrl()
      const res = await POST(
        new Request('http://test/api/client/upload', {
          method: 'POST',
          body: JSON.stringify({ report_download_token: token, right_eye_base64: image, left_eye_base64: image }),
        }) as never,
      )
      const upload = { status: res.status, body: (await res.json()) as Record<string, unknown> }
      await drain()
      return upload
    })

  const upload = await run()
  const current = () => db.tables.client_analyses.find((r) => r.report_download_token === token)!

  return {
    upload,
    clientView: await getClientView(token),
    get row() {
      return current()
    },
    db,
    replay,
    calls: replay.calls,
    errors,
    explain: () => {
      const row = current()
      return [
        `client_analyses: status=${row.status} failure_reason=${row.failure_reason ?? 'null'} stage2_retry_count=${row.stage2_retry_count}`,
        'model calls:',
        describeCalls(replay.calls),
        ...(errors.length ? ['route errors:', ...errors] : []),
      ].join('\n')
    },
    poll: (advanceMs = 0) =>
      withInternalRoutes(async () => {
        if (advanceMs) {
          if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(advanceMs)
          else throw new Error('[client-pipeline] poll(advanceMs) needs vi.useFakeTimers()')
        }
        const view = await getClientView(token)
        await drain()
        return view
      }),
  }
}

/** The client report the polling page would render, or null when it is not ready. */
export function deliveredReport(view: ClientView): Record<string, string> | null {
  return view.status === 200 ? (view.body.report as Record<string, string>) : null
}
