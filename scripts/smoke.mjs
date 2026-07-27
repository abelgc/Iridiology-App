#!/usr/bin/env node
/**
 * Post-deploy smoke test for the client-facing flow.
 *
 *   node scripts/smoke.mjs [baseUrl]     (default https://narasimhasolutions.com)
 *
 * Exit 0 if every check passes, exit 1 with one line per failure.
 * Plain Node, no dependencies, no build step. Runs in ~2s.
 *
 * READ-ONLY BY CONSTRUCTION. Every request is a GET, and every endpoint it
 * touches returns before reaching any write path. It must stay that way: this
 * runs against the production database, and the sweep cron (see live-bugs.md
 * bug 5) will pick up any stray row and retry it with real AI and real cost.
 *
 * Why these seven and not others: each one guards a failure that has actually
 * happened to this project, or one the proxy is one careless matcher edit away
 * from causing. The source material is live-bugs.md in the repo root and the
 * comment block at the bottom of src/proxy.ts.
 */

const DEFAULT_BASE = 'https://narasimhasolutions.com'
const TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------

/** Accepts "https://x.com", "https://x.com/", or bare "x.com". */
function normalizeBase(raw) {
  const trimmed = String(raw ?? DEFAULT_BASE).trim()
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}

/**
 * Every request gets its own 10s abort, so a hung production fails the check
 * instead of hanging the script (and, later, a CI job) forever.
 */
function get(url, init = {}) {
  return fetch(url, {
    method: 'GET',
    redirect: 'follow',
    ...init,
    headers: { 'user-agent': 'narasimha-smoke/1', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** Release a body we are not going to read, so the socket closes. */
function discard(res) {
  return res.body?.cancel().catch(() => {})
}

/** Bare content-type, no charset noise. */
function contentType(res) {
  return (res.headers.get('content-type') ?? '(none)').split(';')[0].trim()
}

/**
 * Prefer the content-length header; fall back to downloading only if the
 * origin omitted it. Keeps the 4MB video off the wire on the happy path.
 */
async function sizeOf(res) {
  const header = res.headers.get('content-length')
  if (header) {
    await discard(res)
    return Number(header)
  }
  const buf = await res.arrayBuffer()
  return buf.byteLength
}

// ---------------------------------------------------------------------------
// checks
// ---------------------------------------------------------------------------

const checks = [
  {
    id: 1,
    label: 'GET /',
    // GUARDS: the proxy matcher regressing and sending paying clients to a
    // login page. src/proxy.ts rewrites "/" to /client precisely so the bare
    // domain is the client app; a client never has a session, so if that
    // rewrite or the /client bypass breaks, the front door becomes /login and
    // nobody can buy anything. Covered by e2e/client-flow.spec.ts, but that
    // suite never runs against the deployed origin — this does.
    async run(base) {
      const res = await get(`${base}/`)
      const body = await res.text()
      const finalPath = new URL(res.url || `${base}/`).pathname
      const bad = []
      if (res.status !== 200) bad.push(`status ${res.status} (expected 200)`)
      if (!contentType(res).includes('text/html')) {
        bad.push(`content-type ${contentType(res)} (expected text/html)`)
      }
      // The og:image meta tag is what turns a shared link into a card. It has
      // silently disappeared from a build before anyone noticed.
      if (!body.includes('og:image')) bad.push('body has no og:image meta tag')
      if (finalPath.startsWith('/login')) {
        bad.push(`landed on ${finalPath} (expected not /login)`)
      }
      return { bad, ok: `200 text/html; og:image present; final path ${finalPath}` }
    },
  },

  {
    id: 2,
    label: 'GET /og.png',
    // GUARDS: an og:image tag that points at a 404. Check 1 only proves the
    // tag exists; this proves the file behind it exists and is a real image.
    // A tag with no file behind it means every shared link loses its preview
    // card and nobody finds out, because nothing errors.
    // Observed in production: 74281 bytes. Bound is deliberately loose so a
    // legitimate re-export does not fail the deploy.
    async run(base) {
      const res = await get(`${base}/og.png`)
      const bad = []
      if (res.status !== 200) bad.push(`status ${res.status} (expected 200)`)
      if (contentType(res) !== 'image/png') {
        bad.push(`content-type ${contentType(res)} (expected image/png)`)
      }
      const bytes = await sizeOf(res)
      if (!(bytes > 10_000)) bad.push(`${bytes} bytes (expected > 10000)`)
      return { bad, ok: `200 image/png; ${bytes} bytes` }
    },
  },

  {
    id: 3,
    label: 'GET /intro.mp4',
    // GUARDS: /intro.mp4 being redirected to /login. This is the exact case
    // src/proxy.ts:68-76 documents: the client-facing pages live under /client
    // and are exempt, but the media they load sits at the domain root, and a
    // client is never logged in. Drop "mp4" from the matcher's exemption list
    // and the <video> element receives an HTML login page instead of video.
    //
    // redirect: 'manual' IS LOAD-BEARING. Following redirects lands on /login,
    // which answers 200 with HTML — a naive "expect 200" check passes while
    // the video is broken. We assert on the FIRST response only.
    //
    // Observed in production: 4290917 bytes.
    async run(base) {
      const res = await get(`${base}/intro.mp4`, { redirect: 'manual' })
      const bad = []
      if (res.status !== 200) {
        const location = res.headers.get('location')
        bad.push(
          `first response ${res.status}${location ? ` -> ${location}` : ''} (expected 200, not a redirect)`,
        )
        await discard(res)
        return { bad, ok: '' }
      }
      if (contentType(res) !== 'video/mp4') {
        bad.push(`content-type ${contentType(res)} (expected video/mp4)`)
      }
      const bytes = await sizeOf(res)
      if (!(bytes > 1_000_000)) bad.push(`${bytes} bytes (expected > 1000000)`)
      return { bad, ok: `200 video/mp4 (no redirect); ${bytes} bytes` }
    },
  },

  {
    id: 4,
    label: 'GET /robots.txt',
    // GUARDS: crawlers abandoning the scrape. Same matcher exemption as check
    // 3, different consequence, spelled out in src/proxy.ts: a crawler fetches
    // robots.txt before generating a link preview, and a redirect to /login
    // makes it give up — so shared links lose their card even though og.png
    // (check 2) is perfectly fine. Two independent ways to lose the same
    // feature, so two independent checks.
    async run(base) {
      const res = await get(`${base}/robots.txt`)
      await discard(res)
      const bad = []
      if (res.status !== 200) bad.push(`status ${res.status} (expected 200)`)
      if (contentType(res) !== 'text/plain') {
        bad.push(`content-type ${contentType(res)} (expected text/plain)`)
      }
      return { bad, ok: '200 text/plain' }
    },
  },

  {
    id: 5,
    label: 'GET /api/client/reports/<absent-token>',
    // GUARDS: the report route being deployed AND the database being reachable
    // with a working service-role key. This route is the only thing standing
    // between a paying customer and the report they bought
    // (src/app/api/client/reports/[token]/route.ts) — on 26/07/2026 seven
    // analyses sat dead behind it. A bad SUPABASE_SERVICE_ROLE_KEY or a
    // Supabase outage cannot show up as a 404 here: it shows up as a 500 or a
    // timeout, because the 404 is only produced after a real query returns no
    // rows. A 404 is therefore proof the round-trip works.
    //
    // SAFETY: this token is a syntactically valid v4 UUID that does not exist,
    // so isValidReportToken passes (a malformed one would short-circuit to 400
    // and prove nothing) and the route returns at the .single() miss, before
    // any of the stale-row update paths. It writes nothing.
    async run(base) {
      const token = '00000000-0000-4000-8000-0000000000ff'
      const res = await get(`${base}/api/client/reports/${token}`)
      const text = await res.text()
      const bad = []
      if (res.status !== 404) {
        bad.push(`status ${res.status} (expected 404 — 5xx/timeout means DB or service key)`)
      }
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch {
        bad.push(`body is not JSON: ${text.slice(0, 80)}`)
      }
      if (parsed && parsed.error !== 'not_found') {
        bad.push(`body error=${JSON.stringify(parsed.error)} (expected "not_found")`)
      }
      return { bad, ok: '404 {"error":"not_found"} — route live, database answered' }
    },
  },

  {
    id: 6,
    label: 'GET /api/client/internal/sweep (no auth)',
    // GUARDS: the rescue cron from live-bugs.md bug 5 being reachable and
    // refusing anonymous callers. It deliberately lives under /api/client/**
    // so the proxy bypass applies (anywhere else Vercel's cron would hit a
    // login page forever); the trade is that its only defence is the
    // CRON_SECRET bearer token, so an anonymous 401 is the thing to assert.
    //
    // HONEST LIMIT: src/app/api/client/internal/sweep/route.ts returns 401
    // when the header is wrong OR when CRON_SECRET is unset. This check
    // therefore proves the route is deployed and closed to the public. It
    // CANNOT prove the secret is actually configured — a deploy that lost
    // CRON_SECRET passes this check while the cron silently 401s itself and
    // stalled analyses stop being rescued. Verifying that needs the secret,
    // which this script deliberately does not carry.
    async run(base) {
      const res = await get(`${base}/api/client/internal/sweep`)
      await discard(res)
      const bad = []
      if (res.status !== 401) bad.push(`status ${res.status} (expected 401)`)
      return { bad, ok: '401 — reachable and refusing anonymous callers' }
    },
  },

  {
    id: 7,
    label: 'GET /api/debug (must NOT be 200)',
    // GUARDS: a credential dump coming back. src/app/api/debug/route.ts was
    // deleted on 2026-07-27 — it had returned the Supabase project URL plus the
    // first 30 characters of the anon key AND of the service-role key, and had
    // sat there unused since 2026-04-03. Nothing protected it but the proxy
    // happening to catch a path outside /client and /api/client.
    //
    // The check stays because the danger was never the file, it was the shape:
    // a diagnostic endpoint added under pressure, echoing env vars, reachable
    // from the internet. This fails the moment one answers 200 again, whatever
    // it is called next time. Expect 404 once the deletion ships; 307 until then.
    //
    // redirect: 'manual' again, for the opposite reason to check 3: following
    // the redirect reaches the login page, which answers 200, and a
    // "status !== 200" assertion would fire a false alarm on healthy prod.
    async run(base) {
      const res = await get(`${base}/api/debug`, { redirect: 'manual' })
      await discard(res)
      const bad = []
      if (res.status === 200) {
        bad.push('status 200 (expected anything but 200 — this route leaks the service-role key)')
      }
      const location = res.headers.get('location')
      return { bad, ok: `${res.status}${location ? ` -> ${location}` : ''} — not publicly readable` }
    },
  },
]

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const green = (s) => (colour ? `\x1b[32m${s}\x1b[0m` : s)
const red = (s) => (colour ? `\x1b[31m${s}\x1b[0m` : s)
const dim = (s) => (colour ? `\x1b[2m${s}\x1b[0m` : s)

async function main() {
  const arg = process.argv[2]
  if (arg === '-h' || arg === '--help') {
    console.log('usage: node scripts/smoke.mjs [baseUrl]   (default ' + DEFAULT_BASE + ')')
    return 0
  }
  if (typeof fetch !== 'function') {
    console.error('FAIL  this script needs Node 18+ (global fetch is missing)')
    return 1
  }

  const base = normalizeBase(arg)
  const started = Date.now()
  console.log(`\nsmoke -> ${base}\n`)

  // Run in parallel: seven independent read-only GETs, keeps the whole thing
  // inside a couple of seconds even with the 10s per-request ceiling.
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        const { bad, ok } = await check.run(base)
        return { check, bad, ok }
      } catch (err) {
        const reason = err?.name === 'TimeoutError'
          ? `no response within ${TIMEOUT_MS / 1000}s`
          : `request failed: ${err?.message ?? err}`
        return { check, bad: [reason], ok: '' }
      }
    }),
  )

  const width = Math.max(...checks.map((c) => c.label.length))
  let failed = 0
  for (const { check, bad, ok } of results) {
    const label = check.label.padEnd(width)
    if (bad.length === 0) {
      console.log(`  ${green('PASS')}  ${check.id}  ${label}  ${dim(ok)}`)
    } else {
      failed += 1
      console.log(`  ${red('FAIL')}  ${check.id}  ${label}  ${red(bad.join('; '))}`)
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const passed = results.length - failed
  console.log('')
  if (failed === 0) {
    console.log(green(`  ${passed}/${results.length} passed`) + dim(`  (${seconds}s)`) + '\n')
    return 0
  }
  console.log(red(`  ${failed}/${results.length} FAILED`) + dim(`  (${seconds}s)`) + '\n')
  return 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    // Anything that escapes the per-check catch is still a failed deploy gate.
    console.error(red(`\n  FAIL  smoke runner crashed: ${err?.stack ?? err}\n`))
    process.exitCode = 1
  })
