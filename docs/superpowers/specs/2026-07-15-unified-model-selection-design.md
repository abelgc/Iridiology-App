# AI model selection — what shipped, what's paused, what's open

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

**Not changed**: `/practitioner`'s own Settings-configured models (the practitioner updates those directly in the Settings UI — that field was already admin-editable and out of scope here). `chat.ts` (practitioner report chat) still has a hardcoded stale model — flagged, not fixed, in this pass.

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
