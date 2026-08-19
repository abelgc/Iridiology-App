---
name: iridology-app-map
description: Orientation map for this iridology analysis app — where the report generation pipeline lives, how /practitioner and /client are split, the report's data model, language handling, and the image pipeline. Use when the user mentions "the report", "the agents", "the sections", "the iris analysis", iridology report generation, the differences between the /practitioner and /client report flows specifically, or needs context on this app's architecture before touching report-generation code. Do NOT trigger on /practitioner or /client mentions unrelated to report generation (e.g. UI buttons, CSV exports, patient lists, Stripe/payment issues, unrelated pages under those routes).
---

# App map

Quick reference, not a tutorial. For the long detail, open the matching `reference/` file — each one says when to open it.

## The first thing to know

- `/practitioner` and `/client` **share the same generation pipeline**: both call `analyzeIrisDual()` (`src/lib/claude/analyze-dual.ts`), with the same system prompt (`src/lib/claude/prompts.ts`) and the same `buildUserPrompt()` (`src/lib/claude/analyze.ts`). A prompt bug affects paid reports just as much.
- `/client` has an exclusive second phase (`src/lib/client/writing-pipeline.ts`) that **rewrites the tone** of the already-generated report for the client — it never re-analyses the iris, it can't invent new findings.
- Generation is **a single call** per analyst (Claude + GPT-4o in parallel, then synthesis) — there is no sequential per-section pipeline.

→ Full detail, cited prompts, and the 3 bias mechanisms already diagnosed (fixation on one finding, false negatives from imaging, notes treated as dogma): `reference/generation-pipeline.md`.

## Invariant that never changes

The standard report has **exactly 14 sections** (`REPORT_SECTION_KEYS` in `src/types/report.ts`) plus `section_15_iris_sign_patterns` (practitioner-only). They are never reordered, renamed, added to, or removed without an explicit user decision — at least 3 places in the codebase (client-report-viewer, report-pdf-document, the client route) assume this exact shape.

→ Full schema for `reports`, `client_analyses`, `report_corrections`, and the comparison report (2 keys, a different shape): `reference/report-data-model.md`.

## Languages

`reports` (the practitioner report table) **has no language column** — it never has. Only `client_analyses.language` is persisted, and only for the client flow. Any "current report language" in the practitioner UI is component state, not data — treat it with suspicion.

→ `reference/languages.md`.

## Image pipeline

Two upload components do NOT share code (`image-upload.tsx` practitioner, `iris-image-upload.tsx` client), each with its own resize/compression before the image reaches the model. One image per eye, no cropping.

→ `reference/image-pipeline.md`.

## Routes and structure

→ Map of the API routes, `src/` folders, and what each external dependency does (Supabase, Anthropic+OpenAI, Stripe, Resend, Vercel): `reference/routes-and-structure.md`.

## How tests run

- `npm test` — Vitest, unit/component.
- `npm run test:int` — Vitest with `vitest.integration.config.ts`.
- `npm run test:e2e` — Playwright.
- `npm run lint` — ESLint.
- No typecheck script: `npx tsc --noEmit -p tsconfig.json`.

## Working rules for this project

- No file edit without showing before/after and waiting for explicit "yes, change" — invoke `changes-awareness` before touching anything (already required by `AGENTS.md`).
- No commit or push without explicit user approval, even if the change itself was already approved.
- Minimal, surgical changes — no drive-by refactors, no "while I'm here".
- Before proposing a fix in `prompts.ts` or `analyze.ts`, check whether it touches `/practitioner`, `/client`, or both — it's almost always both.
