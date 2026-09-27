import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const createAdminClient = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('createAdminClient reached without a session')
  }),
)

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: () => Promise.resolve({ data: null, error: { message: 'no session' } }),
    },
  }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@/lib/supabase/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/server')>()),
  createAdminClient,
}))

import * as analyze from '../analyze/route'
import * as chat from '../chat/route'
import * as compare from '../compare/route'
import * as translate from '../translate/route'
import * as review from '../review/route'
import * as settings from '../settings/route'
import * as patients from '../patients/route'
import * as patient from '../patients/[id]/route'
import * as sessions from '../sessions/route'
import * as session from '../sessions/[id]/route'
import * as reports from '../reports/route'
import * as report from '../reports/[id]/route'
import * as modify from '../reports/[id]/modify/route'
import * as corrections from '../reports/[id]/corrections/route'
import * as clientVoice from '../reports/[id]/client-voice/route'

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

const HANDLERS: [string, Handler][] = [
  ['POST /api/analyze', analyze.POST],
  ['POST /api/chat', chat.POST],
  ['POST /api/compare', compare.POST],
  ['POST /api/translate', translate.POST],
  ['POST /api/review', review.POST],
  ['GET /api/settings', settings.GET],
  ['POST /api/settings', settings.POST],
  ['GET /api/patients', patients.GET],
  ['POST /api/patients', patients.POST],
  ['GET /api/patients/[id]', patient.GET],
  ['PUT /api/patients/[id]', patient.PUT],
  ['DELETE /api/patients/[id]', patient.DELETE],
  ['GET /api/sessions', sessions.GET],
  ['POST /api/sessions', sessions.POST],
  ['GET /api/sessions/[id]', session.GET],
  ['PUT /api/sessions/[id]', session.PUT],
  ['DELETE /api/sessions/[id]', session.DELETE],
  ['GET /api/reports', reports.GET],
  ['GET /api/reports/[id]', report.GET],
  ['PUT /api/reports/[id]', report.PUT],
  ['POST /api/reports/[id]/modify', modify.POST],
  ['GET /api/reports/[id]/corrections', corrections.GET],
  ['POST /api/reports/[id]/corrections', corrections.POST],
  ['POST /api/reports/[id]/client-voice', clientVoice.POST],
] as unknown as [string, Handler][]

beforeEach(() => {
  createAdminClient.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-supabase'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
})

describe('REGRESSION (2026-09-27): practitioner API routes check the session themselves, not only the proxy', () => {
  it.each(HANDLERS)('%s answers 401 without a session and never touches the service-role client', async (_name, handler) => {
    const req = new NextRequest('http://test/api/x', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await handler(req, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) })
    expect(res.status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
