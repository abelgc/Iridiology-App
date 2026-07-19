# AI model selection — what shipped, what's paused, what's open

## Production incident: OpenAI calls were 100% broken (2026-07-19)

While investigating the "we couldn't complete your analysis" reports
(same session as the timeout/API-key fixes below), a live check of
Vercel logs + the OpenAI account dashboard (via `/vercel:vercel-cli` and
browser inspection, not guessing) found two compounding, unrelated bugs
that meant **every OpenAI call in the app was failing**, silently
degrading every dual-model analysis to Claude-only:

1. **The OpenAI project's model allow-list was empty.** `platform.openai.com`
   → Default project → Settings → Limits → "Allow or block models" was
   set to "Allow" mode with zero models checked — meaning the `iris-app`
   API key (permissions: "All", so not itself restricted) could call
   nothing, returning `401 insufficient permissions` regardless of
   account balance ($120 spend limit, $0.77 used — never a credits
   issue). **Fixed by the user directly in the OpenAI dashboard**, not
   via code: checked `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`,
   `gpt-4o` and saved.
2. **`TIER_MODELS.premium_19_90.openai` (and every fallback default) was
   `'gpt-5.6'`, which is not a real model in this account — confirmed
   directly via the OpenAI model picker, which only lists the suffixed
   variants: `gpt-5.6-luna` ("optimized for cost-sensitive workloads",
   correctly used for Basic), `gpt-5.6-sol` ("frontier model for complex
   professional work"), `gpt-5.6-terra` ("balances intelligence and
   cost"). Fixed in `b1bde78`: Premium now uses `gpt-5.6-sol`, the
   natural counterpart to Basic's `luna` (mirrors the existing
   Haiku/Sonnet split on the Anthropic side). A test asserting the old,
   broken value as correct was updated alongside the fix.

Bug #2 alone would have caused every OpenAI call to fail with a
different error (invalid model) even after bug #1 was fixed — both had
to be found and fixed together for OpenAI to actually work.

## Follow-up: the 401 persisted after both OpenAI fixes — root cause is org verification, not code (2026-07-19)

Re-tested end-to-end after the allow-list + model-name fixes above.
Confirmed via live logs that both fixes worked (no more "model not
allowed" / no more invalid-model-name errors) — but the OpenAI leg
still failed with `401 You have insufficient permissions for this
operation.` Traced to a **third, separate gate**, unrelated to the
project-level model allow-list: OpenAI's organization-level
**Verifications** (`platform.openai.com` → Organization settings →
General → "Verifications" — "Verify as an individual or business to
access protected models"). Neither Individual nor Business verification
has been started on this account (both show "Start", not "Verified").
`gpt-5.6-sol` ("frontier model for complex professional work" per
OpenAI's own model picker) is almost certainly gated behind this,
separately from the per-project allow-list checkbox already fixed.

**This is not a code fix — it requires the account owner to complete
identity/business verification directly with OpenAI.** Steps: Organization
settings → General → Verifications → "Start" under "Individual" (fits a
solo-developer project; "Business" only if the app is under a registered
company) → follow OpenAI's own document-upload flow. Review time is
OpenAI's, not instant. No code or project-settings change is needed
once verification completes — the existing `iris-app` key and its
already-fixed allow-list will just start working for gated models.

**Why this hasn't been blocking the app entirely**: `analyze-dual.ts`
already degrades gracefully to a Claude-only result when the OpenAI leg
rejects (confirmed in logs: `"GPT-4o failed, using Claude only"` — note
this log string is a stale label from when the model literally was
`gpt-4o`; it does not mean gpt-4o was actually requested). So this 401
alone was not the cause of customer-visible failures — a separate,
fourth JSON-parsing bug in that same Claude-only fallback path was (see
below). Once that fourth bug is fixed, the app should work correctly for
customers even while OpenAI verification is pending, at the cost of
running Claude-only (no dual-model synthesis) until verification
completes.

## Fourth JSON-parsing bug found live, same session: trailing content after a complete JSON object

Confirmed via Vercel logs, in the Claude-only fallback path described
above: `Analysis failed: Unexpected non-whitespace character after JSON
at position 1462 — near: "...}\n"<<HERE>>"```\n\nI need to provide the
full JSON with all 14 keys. Let me complete the analy"`. Claude produced
a complete, valid JSON object, then appended trailing non-JSON text
(the model apparently second-guessing itself mid-generation). This is
the same general bug family as the three fixed earlier today (control
characters, unterminated fence, token-truncation) but in a different
file: `src/lib/claude/analyze-dual.ts` calls the `AIProvider.complete()`
interface (camelCase `stopReason`, not `writing-pipeline.ts`'s raw-SDK
snake_case `stop_reason`) for its Claude leg, OpenAI leg, and synthesis
call, and — unlike `analyze.ts`, which already has this check — never
checks `stopReason === 'max_tokens'` anywhere.

Given the pattern of finding these one file at a time, dispatched a
broader audit-and-fix pass covering every remaining AI call site for the
same missing-truncation-detection gap.

**Agent results (2026-07-19, investigation only — no files edited yet):**
Inventoried 14 AI-JSON-parsing call sites. Only 2 already had correct
truncation detection (`analyze.ts`, the reference pattern, and
`review.ts`, verified — not assumed — to already mirror it correctly).
**9 sites had the gap and need the fix**: `analyze-dual.ts` (Claude leg,
OpenAI leg, synthesis — 3 calls, includes the confirmed-live bug above),
`compare.ts` (single-provider path has partial detection but gives up
instead of retrying; both dual legs and its synthesis have none — 4
call sites total), `enhance-emotional-field.ts` (both the chakra call
and the blend call — the blend call has an extra latent bug: a
truncated-but-non-empty response is silently accepted today, only
emptiness is checked), `modify-report.ts`, `translate/route.ts`. One
more (`chat.ts`) gets a lighter log-only fix since it's free-form text,
not JSON — truncation there is a UX rough edge, not a parse failure.
One file (`src/lib/claude/client.ts`) turned out to be dead code, no
call sites — flagged, not touched.

Also designed the "trailing garbage" defense-in-depth from the write-up
above: a new `recoverJsonBeforeTrailingGarbage()` in `json-repair.ts`
that, only when `JSON.parse` fails with exactly "Unexpected
non-whitespace character after JSON at position N", retries parsing
just the prefix up to N — verified against the real V8 error string
(`JSON.parse('{"a":1}\n\nI need to provide the full JSON')` reproduces
the exact message shape). Wired into `parse.ts` and `parse-
comparison.ts`, always re-validated against the existing Zod schema
before being accepted — never trusts a recovered prefix on its own.

Deliberately did **not** extract the truncation-retry helper into a
single cross-file shared module (`analyze-dual.ts` and `compare.ts` each
get their own small copy) — this spec's own candidate #4 above already
flagged `runSingleOrDual` as a paused, larger refactor after an
adversarial review found its latency math wrong by 3-4x; folding a
~10-line helper into that paused effort risks the same scope creep the
original pause was meant to avoid.

**Status: proposal complete, not yet applied.** The agent (correctly,
per this repo's `changes-awareness` requirement) stopped short of
editing any files, since a background agent cannot supply the user's
own explicit "yes, change" — it produced copy-pasteable diffs for all 9
files plus a full test plan (8 new/extended test files) instead. Full
diffs live in the agent's transcript; apply on next session once
reviewed.

## Cost & speed audit (2026-07-19, via /improve-codebase-architecture)

Ran a scoped architecture review — this spec + every AI call site + live
Supabase advisor data + Vercel hosting config — against a stated goal of
reducing AI/hosting cost and improving speed. Full visual report (before/
after diagrams per candidate) generated at
`architecture-review-20260719-172701.html` in the OS temp dir; not
committed to the repo. Findings, ranked:

| # | Candidate | Files | Strength |
|---|---|---|---|
| 1 | **Cache the static system prompts** — zero `cache_control` breakpoints anywhere; every call (incl. retries, dual legs, every chat turn) re-bills the full ~6K-token prompt at input price | `prompts.ts`, `analyze.ts`, `analyze-dual.ts`, `compare.ts`, `review.ts`, `chat.ts` | Strong — top recommendation, no behaviour change |
| 2 | **Stage 2 ignores tier gating** — `rewriteReportForClient` always runs 4 `claude-sonnet-5` calls regardless of Basic vs Premium; Stage 1's Haiku savings on Basic are erased by the (more token-heavy) Stage 2 | `writing-pipeline.ts:4`, `stage2/route.ts:114` | Strong — needs a product call on Basic-tier prose quality first |
| 3 | **Billed-but-abandoned generations** — `withTimeout` is `Promise.race`, never aborts; 200s/leg provider timeouts × sequential dual+synthesis can exceed the 270-290s outer watchdogs, so full generations are paid for and discarded. `review.ts`'s retry (200s+5s+200s≈405s) makes this worse | `utils.ts` (withTimeout), `analyze-dual.ts`, `compare.ts`, `review.ts` | Strong — same shape as the Planner timing gap already flagged below |
| 4 | **Dual-model seam hand-rolled twice** — `analyze-dual.ts` and `compare.ts` duplicate the same try-both-then-synthesize pattern; neither dual branch checks `stopReason === 'max_tokens'` (the single branches do), so a truncated leg can silently poison a synthesis call | `analyze-dual.ts`, `compare.ts` | Worth exploring — confirms and extends the duplication this spec already noted on 2026-07-19 |
| 5 | **Polling bills ~120 function invocations per client report** — fixed 3s/4s interval polling for up to 5-6 min; Supabase Realtime is provisioned and completely unused (zero `.channel(` calls) | `client/report/[token]/page.tsx`, `practitioner/sessions/[id]/page.tsx` | Worth exploring |
| 6 | **RLS re-evaluates auth per row + duplicate permissive policies** — confirmed live by Supabase's own performance advisor on `patients`, `sessions`, `reports`, `report_corrections`, `settings`; free SQL-only fix | Supabase RLS policies | Worth exploring — pure migration, no app code change |
| 7 | **Oversized static assets** — logos (1.6-1.8MB) rendered at 44-72px; intro videos (4.1MB/2.3MB) unoptimized, autoplay on the highest-traffic screen | `public/logo*.{png,jpeg}`, `public/intro.mp4`, `public/iris_cut.mp4` | Speculative |

Smaller items noted but not carded: `chat.ts` stale model + default SDK
`maxRetries: 2` (every other call site explicitly sets 0-1) + uncached
full-report-in-system-prompt on every chat turn; Stage-2 stale-retry
re-runs the whole pipeline from scratch (up to ~18 calls across 3
attempts, no partial resume); unbounded `select('*')` list queries on
`/api/patients`, `/api/sessions`, `/api/reports` (fine at today's 26-65
rows/table, a scaling risk later); unindexed FK on
`client_analyses.report_id` + an unused index (`idx_reports_created_at`)
per the Supabase advisor; stale "Railway for deployment" doc/`nixpacks.toml`
contradicting the actual Vercel deployment; a likely-broken
`practitioner/page.tsx` query joining `patients(name)` when the column is
`full_name`.

**Status: candidate #1 shipped 2026-07-19.** `src/lib/ai/anthropic-provider.ts`'s
`complete()` — the single shared method behind `analyze.ts`, both Claude
legs of `analyze-dual.ts`, `compare.ts`, `review.ts`, `modify-report.ts`,
`translate`, and `enhance-emotional-field.ts` (Jyotish) — now sends
`system` as a `cache_control: { type: 'ephemeral' }` block (5-minute TTL)
instead of a plain string, plus logs `cache_creation_input_tokens`/
`cache_read_input_tokens` on every response for production verification.
Covers both `/client` (Stage-1 tier-based analysis, Jyotish) and
`/practitioner` (Stage-1, review, compare, modify-report, chat's own
report-fetch route). Explicitly out of scope for this pass, deferred as
follow-up candidates: `writing-pipeline.ts` (the Planner+3-Writers
pipeline — /client's single biggest AI cost line, has its own raw
Anthropic client) and `chat.ts` (/practitioner report chat — also its own
raw client, plus already-flagged stale-model/retry debt worth bundling
into that follow-up). OpenAI-side legs need no code change — OpenAI's
prompt caching is automatic/prefix-based, already active without an
explicit opt-in field. Grilling decisions: 5-minute default ephemeral
cache (not the 1-hour extended tier — current traffic volume doesn't
clearly justify its 2x write-cost multiplier yet); scope limited to the
shared `AnthropicProvider` seam only. Tests: new
`src/lib/ai/__tests__/anthropic-provider.test.ts` (3 tests: cache_control
block shape, response shape unchanged, usage logging fires) plus the
existing `prompts.test.ts` regression suite — 46 tests passing. `tsc
--noEmit` clean on the changed file (pre-existing unrelated errors in
some test files' type config, not touched by this change).

**Candidate #5 shipped 2026-07-19 (partial — backoff, not Realtime).**
Grilling surfaced a blocker for the original plan: `client_analyses` has
`RLS ... USING (false)` (`docs/migrations/003-client-analyses.sql:52-59`,
"deny direct client/anon access, all access goes through API routes using
service role") — the `/client` flow has no Supabase Auth session, only a
`report_download_token`, so a direct browser-side Realtime subscription
would require opening new anon access on a table holding email/DOB/health
questionnaire data. `/practitioner`'s `sessions`/`reports` tables already
carry `authenticated`-scoped RLS (confirmed via the Supabase advisor
output above), so Realtime would fit there cleanly — but decided against
introducing a new subscription/connection-lifecycle pattern into the
codebase for this pass. Shipped instead: exponential backoff on both
polling loops (`src/app/client/report/[token]/page.tsx`: 3s → 20s cap,
same ~360s total wait ceiling as before, ~120 → ~20-25 requests per
report; `src/app/practitioner/sessions/[id]/page.tsx`: 4s → 20s cap, same
~300s ceiling, converted from `setInterval` to a cancellable recursive
`setTimeout`, ~75 → ~15-18 requests per session). True Realtime for
`/practitioner` remains a candidate for a future pass if backoff isn't
enough. No behaviour change to when either page gives up — only how often
it asks in between.

## Critical bug found via candidate #5 grilling: paid analyses can silently fail even when the AI succeeded (2026-07-19)

While investigating the polling backoff, the user reported the `/client`
report page's `'failed'` screen ("We couldn't complete your analysis this
time...") on **roughly 2 of every 3 reports** — currently blocking launch.
Root cause confirmed by a targeted investigation, and it is the same
timeout/budget mismatch flagged as candidate #3 in the audit above, with
a worse consequence than originally scoped:

- **`src/app/api/client/upload/route.ts:75-153`** wraps `analyzeIrisDual`
  in `withTimeout(..., 270_000, ...)`. `analyzeIrisDual`
  (`analyze-dual.ts`) runs Claude+GPT in parallel (up to ~200s each, per
  each provider client's own `timeout: 200000`), then — only if both
  succeed — a third, **sequential** Claude synthesis call (up to ~200s
  more). Worst case ~400s of real provider time against a 270s guard.
- `withTimeout` is a bare `Promise.race` and **never aborts the
  underlying request** (by design, to avoid double-billing/duplicating
  work) — so when the 270s clock wins, the route's `catch` block
  (`upload/route.ts:154-173`) writes `client_analyses.status = 'failed'`
  while the real Anthropic/OpenAI calls keep running server-side,
  unseen, already billed.
- **The serious part**: if that in-flight call *does* finish moments
  later with a good result, `upload/route.ts:116-140` has already
  inserted the finished report into the `reports` table and tries to
  flip `client_analyses.status` from `analyzing → stage2_processing` —
  but that update is guarded on `.eq('status', 'analyzing')`
  (`upload/route.ts:129-140`), which now matches 0 rows because the
  staleness path already flipped it to `'failed'`. The late-arriving
  success is **silently discarded** (`upload/route.ts:142-145`). A
  customer can pay, the analysis can fully succeed, and they still land
  on the failure screen — with a completed, orphaned `reports` row no
  one ever sees.
- Two other paths reach the same failed screen: the polling route's own
  290s staleness ceiling firing before the upload route's `catch` block
  can write (belt-and-braces for a hard `maxDuration=300` kill,
  `reports/[token]/route.ts:46-63`), and Stage 2 exhausting its 2 silent
  retries (`stage2_stale_after_retries`, ~14.5 min wall-clock,
  `reports/[token]/route.ts:77-94`).
- All three share one root cause: per-call AI timeouts (200s × up to 2-3
  sequential legs) are not sized against the route-level watchdogs
  (270s/290s/300s) — this is a budget-mismatch problem, not primarily an
  AI-reliability problem. Confirms the audit's candidate #3 was
  correctly flagged Strong, and raises its real-world severity from
  "wasted spend" to "wasted spend **and** lost paid deliverables."

**The architecture-review HTML report (`architecture-review-20260719-172701.html`)
already covers this exact failure mode** under candidate #3
("Billed-but-abandoned generations") — its before/after diagram shows the
same race between the outer watchdog and the sequential dual+synthesis
legs. This bug report is the concrete, reproducing-in-production instance
of that candidate, not a new item.

**Status: fixed 2026-07-19 (`7ed95c9`), manually verified on localhost by
the user before commit.** Grilling surfaced two separable fixes: (A)
resize the timeouts, or (B) stop discarding a late-arriving success. (A)
was deferred — no real production latency numbers exist for this
environment's dual-model Stage-1 call, and guessing risks making things
worse (too tight = more failures, too loose = risks the hard 300s
`maxDuration` kill instead of a graceful one). (B) shipped instead:
`src/app/api/client/upload/route.ts`'s CAS-guarded status update now
retries once more, guarded specifically on `status = 'failed'`, when the
normal `status = 'analyzing'` guard loses the race — recovering the
already-inserted `reports` row and resuming Stage 2 normally instead of
silently discarding it. If the rescue attempt also finds 0 rows (status
moved to something else entirely), it still safely no-ops, unchanged from
before. `src/lib/claude/analyze-dual.ts` also gained real timing logs
around the parallel dual legs and the sequential synthesis call, so a
future (A) pass can size timeouts from production data instead of
guesses — no timing test file exists yet for this pure-logging addition.
2 new tests (rescue-succeeds, rescue-also-fails); full suite 255 passing.

This fix does not reduce how often the 270s race is lost (that's still
(A), still open) — it only stops a lost race from destroying a
successfully-completed, paid analysis. (A) remains a candidate for a
follow-up pass once the new timing logs have produced real data.

Candidates #2, #4, #6, #7 not implemented yet — presented to the user for
selection via the skill's grilling loop; this section will be updated as
each is picked up.

## New: `docs/min-quality-checker.md` (2026-07-19)

Added a minimum-coverage checklist for Stage-1 iridiology analysis,
addressing a gap the audit's prompt-content survey confirmed: the report
schema (`report.ts`) only validates that all 15 sections are present and
non-empty, with no check that the model actually scanned every zone ring,
organ system, or sign category. The doc does not restate or override
existing interpretive rules (the Meaning Law, severity calibration, the
jaundice/sclera safety boundary, the assert-vs-redirect rule) — it only
covers *what must be looked at*, not *how to talk about it*.

A condensed version is wired directly into the Stage-1 system prompt
(`STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` in `src/lib/claude/prompts.ts`,
inserted after STEP 1 — INVENTORY ALL IRIS PATTERNS), so both
`analyze.ts` and `analyze-dual.ts` (single and dual legs) see it before
producing a report. `compare.ts`'s and `review.ts`'s separate prompts are
not yet wired to it — out of scope for this pass, candidates for a
follow-up if the checklist proves useful. Not automatically enforced: no
code currently parses report content against this checklist; if quality
becomes a measured problem, the natural next step is a cheap post-hoc
Haiku pass scoring completed reports against it, rather than trusting the
system prompt alone. Verified via `npx vitest run
src/lib/claude/__tests__/prompts.test.ts` (43 passed) that the prompt
addition didn't break existing assertions.

## Verification pass (2026-07-19)

Six read-only agents (3 scoped to /client call sites, 3 scoped to /practitioner
call sites) re-audited every claim in this doc against current code. Result:
**nothing has moved since 2026-07-15.** The model swap in `63e50d8` is still
the only commit touching `src/lib/ai/` or `src/lib/claude/writing-pipeline.ts`
since this doc was written. Two new findings surfaced along the way:

- The "single-vs-dual" pattern the paused feature wanted to extract into a
  shared `runSingleOrDual` helper is **duplicated in two places**, not one:
  `src/lib/claude/analyze-dual.ts` (`analyzeIrisDual`) and
  `src/lib/claude/compare.ts` (`compareIris`) each hand-roll the same
  try-both-then-fall-back-to-single shape independently.
- `src/lib/claude/compare.ts:155` still labels its synthesis prompt
  `"ANALYSIS B (GPT-4o...)"` — a stale text label sent to the LLM, not an
  actual model selection (the real model is resolved dynamically via
  `getBothProviders()`/`getAIProvider()`). Cosmetic, but worth a one-line fix
  if `compare.ts` is ever touched.

Everything else — the shipped model swap, the `thinking` overrides, the
"not changed" list (chat.ts staleness, practitioner Settings scope), the
paused unified admin panel, and the still-open Planner self-check
recommendation — is CONFIRMED unchanged. See per-claim verdicts in the
sections below; none needed updating beyond this note.

## What actually shipped (2026-07-15)

A big unified "pick your models everywhere" redesign was investigated (13 agents: 9 investigators, 2 architects, 2 provider experts) and then descoped after an adversarial timeout review found the proposal's latency math was wrong by 3-4x. Rather than build that, we shipped a much smaller, verified fix:

| Change | File | Why |
|---|---|---|
| Essential tier (Stage-1 analysis) uses `claude-haiku-4-5-20251001` + `gpt-5.6-luna` | `src/lib/ai/get-provider.ts` (`TIER_MODELS.basic_12`) | `gpt-4.1-mini` was retired; Haiku was already current |
| Premium tier (Stage-1 analysis) uses `claude-sonnet-5` + `gpt-5.6` | `src/lib/ai/get-provider.ts` (`TIER_MODELS.premium_19_90`) | `claude-sonnet-4-6` and `gpt-4o` were both stale/retired |
| Planner-Writer pipeline (client-facing rewrite, both tiers) uses `claude-sonnet-5` | `src/lib/client/writing-pipeline.ts` | Same staleness fix; this pipeline is not tier-differentiated |
| `thinking: disabled` on every Sonnet 5 call | `src/lib/ai/anthropic-provider.ts`, `src/lib/client/writing-pipeline.ts` | Sonnet 5 runs adaptive thinking by default unless told not to, which can silently truncate the tightly-budgeted (1200-1600 token) Planner/Writer JSON output mid-response |
| `thinking: enabled` (`budget_tokens: 2048`) on Haiku calls specifically | `src/lib/ai/anthropic-provider.ts` | Haiku 4.5 ships thinking off by default (opposite of Sonnet 5) and gains real benefit from it — enabled to better match `gpt-5.6-luna`, which reasons by default. Stage-1's 8192-token budget has plenty of headroom, unlike the Planner's 1200. |
| Default fallback models (when Settings is empty) updated to `claude-sonnet-5` / `gpt-5.6` | `src/lib/ai/get-provider.ts` | Keeps the safety-net default current; also helps the Jyotish call, which reads this same fallback |

**Not changed**: `/practitioner`'s own Settings-configured models (the practitioner updates those directly in the Settings UI — that field was already admin-editable and out of scope here). `chat.ts` (practitioner report chat) still has a hardcoded stale model (`claude-sonnet-4-6`, `src/lib/claude/chat.ts:31`) — flagged, not fixed, in this pass. Confirmed still stale as of 2026-07-19 (no commits to this file since 2026-04-30).

## What was investigated and paused: unified admin-configurable model selection

The original ask was to let the product owner pick 1-2 models in one place and have that choice — with the existing single-vs-dual logic already used in `/practitioner` — apply everywhere in `/client` and `/practitioner`. A 13-agent investigation produced a detailed hybrid architecture (extend the `settings` table with named model slots, extract a shared `runSingleOrDual` helper, migrate call sites in 9 staged steps). Two follow-up adversarial reviews then found the proposal's worst-case latency math for adding dual-model to the Planner was wrong by roughly 3-4x against the app's 200s/270s/300s timeout guards, and flagged several other gaps (a `getAIProvider()` fix that could silently violate the "translate/modify-report/chat stay single-model" decision; `Step 6`'s stage-1 slots needing a stricter validation gate than the rest).

This full architecture is **paused, not implemented**. If revisited, start from a fresh investigation rather than resuming the old plan verbatim — model landscape and pricing move fast enough (this session alone saw GPT-5.6 ship mid-conversation) that a stale plan is worse than no plan.

## Still open: dual-model for the Planner specifically

The narrower ask — just the Planner step in `writing-pipeline.ts` getting a second model's opinion — was investigated separately with 4 focused agents (timing/safety, concrete code design, quality/value assessment, cost). Findings:

- **Cost**: negligible — a few cents per report against a €10 tier price gap.
- **Quality value**: genuinely uncertain, leaning skeptical. The Planner compresses text a prior step already wrote (it never sees the iris image), which is closer to mechanical extraction than open interpretation — two models likely converge rather than usefully disagree. No documented quality problem was found in git history or tests motivating this. A cheaper, zero-extra-call alternative exists: the 3 Writers already have a self-check step baked into their prompt; the Planner does not.
- **Timing/safety**: buildable safely, but not a toggle — needs explicit tight per-leg timeouts (two independent agents converged on ~45s/leg + ~25s synthesis), a single-model fallback on retry (not a second dual attempt), and a live-verified real GPT-5.6 latency number this environment couldn't obtain (no working API key locally). One agent also found the *current, already-shipped* pipeline's real worst-case (accounting for the SDK's own automatic retry-on-timeout) is closer to ~180s per call than the visible `90_000` constructor value suggests — worth knowing regardless of whether dual-Planner ever ships.
- **Concrete code design**: a self-contained proposal exists (raw `openai` SDK call added directly to `writing-pipeline.ts`, mirroring its existing raw-Anthropic style; `Promise.allSettled` dual pair + Claude-led synthesis, reusing the existing `ClientReportBrief` schema) — not implemented.
- **Tier**: the pipeline has zero tier awareness today — a dual-Planner change would apply to both Essential and Premium reports unless new gating logic is added.

**Recommendation, not yet acted on**: try the free self-check addition to the Planner's prompt first. If report quality is still a problem after that, the dual-model design above is ready to implement with real numbers, not guesses.
