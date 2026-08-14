import { NextResponse } from 'next/server'
import { logAppError } from '@/lib/error-log'

export const runtime = 'nodejs'

const MAX_MESSAGE_LENGTH = 2000
const MAX_STACK_LENGTH = 8000
// Comfortably above the two field caps, so a request can't hide an arbitrarily large
// `context` payload behind valid message/stack lengths.
const MAX_BODY_BYTES = 20_000

// Deliberately lives under /api/client/** for the same reason as the sweep and health
// routes (src/app/api/client/internal/sweep/route.ts:7-12): the proxy bypasses the
// Supabase session check for anything under /api/client, so an anonymous visitor who
// crashes before ever logging in can still reach this endpoint. A route anywhere else would
// hit the session check, find no user, and 302 to /login — which is HTML, not JSON, so the
// client's error beacon would itself throw. Unlike the two cron routes there is
// deliberately no CRON_SECRET here: the caller is a browser tab, not Vercel's scheduler,
// and shipping a bearer secret into every visitor's JS bundle would not be a secret at all.
export async function POST(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 400 })
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { message, stack, context } = body as Record<string, unknown>

  if (typeof message !== 'string' || message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'invalid_message' }, { status: 400 })
  }

  if (stack !== undefined && (typeof stack !== 'string' || stack.length > MAX_STACK_LENGTH)) {
    return NextResponse.json({ error: 'invalid_stack' }, { status: 400 })
  }

  if (context !== undefined && (typeof context !== 'object' || context === null)) {
    return NextResponse.json({ error: 'invalid_context' }, { status: 400 })
  }

  await logAppError({
    source: 'client',
    route: null,
    message,
    stack: typeof stack === 'string' ? stack : null,
    context: context ?? null,
  })

  return NextResponse.json({ ok: true })
}
