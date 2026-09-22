import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let currentUser: { id: string } | null = null
const getClaimsMock = vi.fn(() =>
  Promise.resolve(
    currentUser
      ? { data: { claims: { sub: currentUser.id } }, error: null }
      : { data: null, error: { message: 'no session' } },
  ),
)
const getUserMock = vi.fn(() => Promise.resolve({ data: { user: currentUser } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getClaims: getClaimsMock,
      getUser: getUserMock,
    },
  }),
}))

import { proxy } from '../proxy'

function req(pathname: string) {
  return new NextRequest(new URL(`http://test${pathname}`))
}

beforeEach(() => {
  currentUser = null
  getClaimsMock.mockClear()
  getUserMock.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://test-supabase'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
})

describe('REGRESSION (2026-09-22): verifies the session via getClaims, not getUser', () => {
  // getUser() always makes a network round trip to the Auth server on every single
  // navigation — Supabase's own current guidance recommends getClaims() instead: same
  // security guarantee (full JWT verification, unlike getSession()), but verified locally
  // via WebCrypto when the project uses asymmetric signing keys, with no code change
  // needed to benefit once that's turned on.
  it('calls getClaims, never getUser, to check an authenticated request', async () => {
    currentUser = { id: 'u1' }
    await proxy(req('/practitioner'))
    expect(getClaimsMock).toHaveBeenCalledTimes(1)
    expect(getUserMock).not.toHaveBeenCalled()
  })

  it('treats a getClaims error the same as no session — redirects to /login', async () => {
    currentUser = null
    const res = await proxy(req('/practitioner'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})

// Every route a practitioner uses that is NOT under /client or /api/client — these are
// exactly the routes this app's data model assumes are behind login. proxy.ts's own
// config.matcher is what decides whether these requests reach this function at all in
// production; that matcher syntax can't be exercised by a plain unit test without
// spinning up Next.js itself, so this suite instead proves the function's own runtime
// check protects every one of them once reached — the layer that actually matters if a
// future matcher edit or added route slips past the pattern.
const PROTECTED_API_ROUTES = [
  '/api/analyze',
  '/api/chat',
  '/api/compare',
  '/api/patients',
  '/api/patients/some-id',
  '/api/reports',
  '/api/reports/some-id',
  '/api/reports/some-id/client-voice',
  '/api/reports/some-id/corrections',
  '/api/reports/some-id/modify',
  '/api/review',
  '/api/sessions',
  '/api/sessions/some-id',
  '/api/settings',
  '/api/translate',
]

const PROTECTED_PRACTITIONER_PAGES = [
  '/practitioner',
  '/practitioner/patients',
  '/practitioner/patients/some-id',
  '/practitioner/patients/some-id/edit',
  '/practitioner/patients/new',
  '/practitioner/reports',
  '/practitioner/reports/some-id',
  '/practitioner/reports/some-id/chat',
  '/practitioner/reports/some-id/edit',
  '/practitioner/sessions',
  '/practitioner/sessions/some-id',
  '/practitioner/sessions/new',
  '/practitioner/settings',
]

describe('proxy() auth boundary', () => {
  it.each([...PROTECTED_API_ROUTES, ...PROTECTED_PRACTITIONER_PAGES])(
    'redirects an unauthenticated request to /login: %s',
    async (pathname) => {
      currentUser = null
      const res = await proxy(req(pathname))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/login')
    },
  )

  it.each([...PROTECTED_API_ROUTES, ...PROTECTED_PRACTITIONER_PAGES])(
    'lets an authenticated request through without redirecting: %s',
    async (pathname) => {
      currentUser = { id: 'practitioner-1' }
      const res = await proxy(req(pathname))
      expect(res.status).not.toBe(307)
    },
  )

  it('bypasses auth for /client paths, matching the app-level public-client design', async () => {
    currentUser = null
    const res = await proxy(req('/client/upload'))
    expect(res.status).not.toBe(307)
  })

  it('bypasses auth for /api/client paths, matching the app-level public-client design', async () => {
    currentUser = null
    const res = await proxy(req('/api/client/upload'))
    expect(res.status).not.toBe(307)
  })

  it('rewrites the bare root path to /client without requiring login', async () => {
    currentUser = null
    const res = await proxy(req('/'))
    expect(res.status).not.toBe(307)
  })

  it('never redirects an authenticated user away from /login (sends them to /practitioner instead)', async () => {
    currentUser = { id: 'practitioner-1' }
    const res = await proxy(req('/login'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/practitioner')
  })

  it('lets an unauthenticated request reach /login itself (no redirect loop)', async () => {
    currentUser = null
    const res = await proxy(req('/login'))
    expect(res.status).not.toBe(307)
  })
})
