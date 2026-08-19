# Generation pipeline — detail

## Call chain

`analyzeIrisDual()` (`src/lib/claude/analyze-dual.ts:42`):
1. `buildPatientContext(patientId)` (`context.ts`) — fetches `previousReportSummary` (summary of the latest report) and `practitionerCorrections` (up to 10 prior corrections from `report_corrections`, formatted `Section X: ...`). If `patientId` is empty (always the case for /client), both are `null`.
2. `buildUserPrompt()` (`analyze.ts:61`) assembles the user turn: patient data, the practitioner's clinical hypothesis, previous findings, previous corrections, the health questionnaire, and asks to analyse the two attached images.
3. `getStandardAnalysisSystemPrompt(language)` (`prompts.ts`) — the full system prompt (4-step reasoning structure, Jensen zone map, severity calibration, system-connection rules).
4. Claude and GPT-4o run **in parallel** (`Promise.allSettled`), each with the same system+user prompt.
5. If both respond: a third synthesis call (Claude) merges them, with the explicit rule "where both analyses agree on a finding, state it with stronger confidence".
6. If GPT-4o fails: Claude-only is used. If Claude fails: hard error.

`/practitioner` (`api/analyze/route.ts`) and `/client` (`api/client/upload/route.ts:118`) call this same function. The only real difference: `/client` always passes `patientId: ''` (no prior history) and uses `forceLanguage: true`.

## The 3 bias mechanisms already diagnosed (see `reported bug/` at the repo root for the real case)

**P1 — fixation on one finding**: `prompts.ts`, the "SYSTEM CONNECTIONS" rule — requires every section to link to another system from a short, fixed list (liver↔digestive↔immune↔adrenal↔thyroid...), with no cap on how many times the same system can be used as the connector. Combined with "PRIORITISATION" (pick 1-2 dominant systems), the strong finding gets re-injected into almost every section. It's a single call — there's no per-section context isolation to stop it.

**P2 — false negatives**: the model never sees more than what survives client-side compression (see `image-pipeline.md`). One image per eye, no cropping — a large share of the frame is eyelid/lashes/eyebrow, not iris.

**P3 — notes treated as dogma**: `practitionerCorrections` is injected in `analyze.ts` (lines 82-83) **with no "verify against the iris" warning**, unlike the initial clinical hypothesis (line 77, which does have one). The instruction "maintain consistency with previous findings... explain the change" (line 91) pushes toward repeating what was already written. In `/client`, `main_complaint` lands on that same unhedged line (`symptoms`, line 76).

## Other routes on the same pipeline

- `analyze-dual.ts` also serves `compare.ts` (session-to-session comparison mode, different prompt: `COMPARISON_ANALYSIS_SYSTEM_PROMPT`) and `review.ts` (technical review of the practitioner's own interpretation, `TECHNICAL_REVIEW_SYSTEM_PROMPT` — this one has its OWN instance of the P3 problem: "PRIOR PRACTITIONER CORRECTIONS... must inform your interpretations", exclusive to /practitioner).
- `modify-report.ts` (`REPORT_MODIFICATION_SYSTEM_PROMPT`) is the post-generation edit chat — it never re-analyses images, only rewrites already-generated text on the practitioner's request. It already has an explicit language-preservation rule.
- `/client` adds an exclusive phase 2: `src/lib/client/writing-pipeline.ts` — Planner (1 call) + 3 parallel Writers (3 calls) = 4 total calls, a fixed budget by design. It rewrites tone, never invents findings ("Base every field only on what the report actually supports").
