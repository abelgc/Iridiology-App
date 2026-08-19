# Routes and structure

## Folder map

- `src/app/practitioner/**` — practitioner UI (patients, sessions, reports, settings).
- `src/app/client/**` — the paid flow UI (upload, intake, payment, report/[token]).
- `src/app/api/**` — route handlers. Root = practitioner-facing (`analyze`, `compare`, `review`, `reports/**`, `sessions/**`, `patients/**`, `chat`, `translate`, `settings`). `api/client/**` = client (`intake`, `payment/**`, `upload`, `internal/{stage2,sweep,health,log-error}`, `reports/[token]/**`).
- `src/lib/claude/` — all prompt and analysis-call logic.
- `src/lib/ai/` — provider abstraction (`get-provider.ts` decides Anthropic vs OpenAI vs both based on tier).
- `src/lib/client/` — client-exclusive pipeline (writing-pipeline, trigger-stage2).
- `src/lib/stripe/`, `src/lib/supabase/`, `src/lib/validators/` (Zod schemas).
- `src/components/{reports,sessions,client,patients,settings,shared,ui}/`.
- `src/types/{report.ts, database.ts, claude.ts, comparison-report.ts}`.

## External dependencies — their real role, not a generic one

- **Supabase**: DB + auth. `createAdminClient()` server-side for almost everything (RLS is bypassed server-side, not client-side).
- **Anthropic + OpenAI**: the two legs of `analyzeIrisDual` — never just one by default except as a fallback. The tier (`basic`/`premium`) decides which specific model of each is used, not whether both are used (both tiers use both providers).
- **Stripe**: payments, exclusive to `/client` (checkout-session, webhook, discount-code). `/practitioner` never charges anything directly.
- **Resend**: client report delivery email (`api/client/reports/[token]/email`).
- **Vercel**: deploy + `waitUntil()` — the pattern used in `client/upload/route.ts` and `client/internal/stage2` to return the HTTP response fast and keep processing in the background.
