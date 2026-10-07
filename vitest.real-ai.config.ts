import { defineConfig } from 'vitest/config'
import path from 'path'

// REAL-AI suite: the client pipeline end to end with real Anthropic + OpenAI calls on a real
// iris photo. No model response is mocked; the only test double is a Supabase guard that lets
// the read-only `settings` lookup through and swallows every write.
//
//   npm run test:real-ai                      es, en, de on premium_2990 (about 4 min, about 2 USD:
//                                             per language ~78k in / 22k out Sonnet, 19k / 1.5k GPT)
//   REAL_AI_LANGS=de npm run test:real-ai     one language
//   REAL_AI_TIERS=premium_2990,basic_1990     also the Essential tier models
//   REAL_AI_SEQUENTIAL=1                      one language at a time instead of in parallel
//   REAL_AI_SETTINGS_FROM_DB=0                keys from ANTHROPIC_API_KEY / OPENAI_API_KEY only
//   REAL_AI_ALLOW_SKIP=1                      pass (skip) when no keys exist instead of failing
//
// Spending guard (src/test/real-ai/setup.ts): nothing runs without REAL_AI_CONFIRM_SPEND=yes;
// without it the run stops at once and prints the estimated cost (REAL_AI_ALLOW_SKIP=1 skips).
//   REAL_AI_ANTHROPIC_API_KEY + REAL_AI_OPENAI_API_KEY   a dedicated low-limit key pair, used
//                                             instead of the production keys (recommended)
//   AI_REPLAY_RECORD=<set>                    also write the replies as replay recordings to
//                                             src/test/ai-replay/recordings/<set>/ (needs the
//                                             dedicated keys above)
//
// Keys: the `settings` table of the Supabase project in .env.local (as production), else the
// ANTHROPIC_API_KEY / OPENAI_API_KEY env vars. Without keys the suite FAILS on purpose.
//
// What fails the run: any call stopping on max_tokens/length or using more than 75% of its
// max_tokens; stage 1 output failing reportContentSchema or the synthesis output not parsing;
// a client report missing a section or in the wrong language; stage 1 or stage 2 using more
// than 80% of its 270s ceiling, or the rewrite more than 80% of its 200s ceiling. The failure
// prints a per-call table (call, model, tokens used / max_tokens, stop reason, seconds) and
// writes every model output to test-results/real-ai/*.json.
//
// Kept out of `npm test` (vitest.config.ts excludes __real_ai__) so the unit suite stays fast
// and offline. src/lib/client/__tests__/token-budget-guard.test.ts is the cheap offline guard
// built from this suite's measurements.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__real_ai__/**/*.test.ts'],
    setupFiles: ['./src/test/real-ai/setup.ts'],
    globals: true,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 15 * 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
