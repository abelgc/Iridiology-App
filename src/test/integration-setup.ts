import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Load .env.test.
//
// Vitest only surfaces VITE_-prefixed vars into import.meta.env; it does not populate
// process.env from a dotenv file, and the app reads process.env.NEXT_PUBLIC_SUPABASE_URL
// directly (src/lib/supabase/server.ts). So load it here, by hand — the repo has no dotenv
// dependency and this file is not worth adding one for.
//
// Values already present in the environment WIN, so CI can override without editing a file.
// ---------------------------------------------------------------------------
const envPath = path.resolve(process.cwd(), '.env.test')
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// ---------------------------------------------------------------------------
// THE GUARD. Non-negotiable.
//
// These tests INSERT, UPDATE and DELETE. Every single one of them must be talking to the
// local stack on 127.0.0.1:54321 and nothing else. Production is oxaiiawgklmltonuglqw; a
// stray .env.local on someone's machine, or a shell that still has the production URL
// exported from an earlier command, is all it would take. Throwing here — at setup, before
// a single test body runs — is the only thing standing between this suite and live data.
//
// Do not soften this to a warning. Do not add an env var that disables it.
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
  throw new Error(
    `integration tests refuse to run against "${url}" — ` +
      'they only ever run against the local Supabase stack at http://127.0.0.1:54321. ' +
      'Run `npx supabase start` and check .env.test.',
  )
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is unset — run `npx supabase status` and update .env.test')
}

// Belt and braces: even if a mock somehow escapes, there is no key to spend money with.
// A test that reaches a real provider fails loudly on a missing key instead of billing.
for (const paidKey of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'RESEND_API_KEY']) {
  if (process.env[paidKey]) {
    throw new Error(
      `${paidKey} is set while running integration tests. Unset it: these tests must never be ` +
        'able to reach a paid provider, so that an escaped mock fails instead of spending money.',
    )
  }
}
