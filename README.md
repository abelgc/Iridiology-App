# Iridology Analysis App

A Next.js 14 application for iridological iris analysis using Claude AI.

## Features

- Upload iris images for AI-powered iridological analysis
- Three analysis modes: Standard, Comparison (temporal), Technical Review
- 11-section structured reports in Spanish
- Report editing, corrections, and chat interface
- Patient management with session history
- Supabase authentication and database

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Database & Auth**: Supabase (PostgreSQL)
- **AI**: Claude API (claude-opus-4-6) via Anthropic SDK
- **Deployment**: Railway

## Setup

### Prerequisites
- Node.js 18+
- Supabase project
- Anthropic API key

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Database Setup

Run the SQL in `docs/schema.sql` in your Supabase SQL editor to create the required tables and RLS policies.

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Testing

```bash
npm run test          # Unit and integration tests (Vitest)
npm run test:e2e      # End-to-end tests (Playwright)
npm run test:real-ai  # Client pipeline with REAL Anthropic + OpenAI calls (paid, ~4 min, ~2 USD; needs REAL_AI_CONFIRM_SPEND=yes)
```

`npm run test:real-ai` runs stage 1 (`analyzeIrisDual`, the upload route's providers and
options) and stage 2 (Jyotish + `rewriteReportForClient`) for es, en and de on the committed
iris photo `e2e/fixtures/face-eye-left.jpg`. Nothing is mocked except Supabase writes. It fails
when any model call stops on `max_tokens` or uses more than 75% of it, when a stage-1 output
does not parse into all sections, when a client report misses a section or drifts language, or
when a stage uses more than 80% of its production time ceiling (270s / 200s rewrite). Keys come
from the `settings` table of the Supabase project in `.env.local`, or `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY`. Options and details: header of `vitest.real-ai.config.ts`. Run it before
shipping any change to a prompt or a `max_tokens`. Per-call outputs land in
`test-results/real-ai/`.

The offline counterpart, `src/lib/client/__tests__/token-budget-guard.test.ts`, runs in
`npm test`: it fails when a call's `max_tokens` is below the real output size that suite
measured (plus 25% headroom), or when the Planner / stage-1 output shape changes without being
re-measured.

### Testing AI without spending

`npm test` never calls a paid model API, and still runs the AI pipeline on real replies:

- **Network guard.** `src/test/setup.ts` installs `src/test/ai-replay/guard.ts`: any request to
  Anthropic or OpenAI (by host, or by API path if a `*_BASE_URL` points elsewhere) is refused
  and fails the test, even when production code swallows the error.
- **Replay of real replies.** `startAiReplay({ lang })` (`src/test/ai-replay/replay.ts`) answers
  those requests at the HTTP layer with full-size replies recorded from real runs
  (`src/test/ai-replay/recordings/`, fictional intake, committed iris photo, names scrubbed).
  The SDKs, `AnthropicProvider` / `OpenAIProvider`, the writing pipeline's own client, prompt
  building, parsing, retries and the routes are all production code. Each call is matched by
  role (Claude leg, GPT leg, synthesis, guards, Jyotish, Planner, Writer A/B/C) and language.
- **Budget-faithful.** A request whose `max_tokens` is below what the real model wrote gets the
  reply cut at `max_tokens` with `stop_reason: max_tokens`, like the API. Setting the Planner back
  to 1200 makes `npm test` fail with the real `response_too_long`.
- **Contract checks.** A request with another model, without `thinking: disabled` on Sonnet, or
  with a different structured-output mode than the recording fails the test as drift.
- **Failure shapes** (`src/test/ai-replay/failures.ts`): real restart replies ("Wait, let me
  produce the full complete JSON..."), real Planner cut-offs, real invalid Writer JSON, JSON then
  markdown (derived from a real reply), credit balance 400, 529 overloaded, OpenAI 500, a call
  that never answers. `src/app/api/client/__tests__/paid-flow*.replay.test.ts` run upload route,
  stage 1, stage 2 route and the report endpoint the client polls over them (fake timers for the
  270s / 200s budgets and the staleness retries).

Recording new replies (after a prompt or model change) costs one real-AI run. Use a separate,
low-limit key pair so tests can never spend production credit:

```bash
REAL_AI_CONFIRM_SPEND=yes REAL_AI_ANTHROPIC_API_KEY=... REAL_AI_OPENAI_API_KEY=... \
  AI_REPLAY_RECORD=master-2026-11-01 npm run test:real-ai
```

Then point `DEFAULT_SET` in `src/test/ai-replay/recordings.ts` at the new set, and review the
diff for personal data. Earlier real-AI artifacts can be converted for free:
`node scripts/ai-replay-import.mts set <set> test-results/real-ai/<run>.json` (see its header).
`npm run test:real-ai` refuses to start without `REAL_AI_CONFIRM_SPEND=yes` and prints the
estimated cost first.

## Deployment (Railway)

1. Push code to GitHub
2. Connect repository to Railway
3. Set environment variables in Railway dashboard
4. Railway auto-deploys on push

## Database Schema

See `docs/schema.sql` for the full schema including:
- `patients` — patient records
- `sessions` — analysis sessions per patient
- `reports` — generated iridology reports (JSONB)
- `report_corrections` — practitioner corrections per section
