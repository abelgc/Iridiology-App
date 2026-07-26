import { NextResponse } from 'next/server'
import { sweepStaleAnalyses } from '@/lib/client/rescue'

export const runtime = 'nodejs'
export const maxDuration = 300

// Deliberately lives under /api/client/** so it inherits the proxy's existing bypass
// (src/proxy.ts) — a route anywhere else would be caught by the Supabase session check,
// find no user, and get redirected to /login, so Vercel's cron would silently hit a login
// page forever. Auth here is the CRON_SECRET bearer token instead, which is what Vercel
// sends. Without that env var set the route refuses every request rather than running
// unauthenticated.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await sweepStaleAnalyses()
  return NextResponse.json({ ok: true, ...result })
}
