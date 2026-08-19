# Report data model

## Tables (supabase/migrations/20260727000000_remote_schema.sql)

**`reports`** (line 92) — the practitioner report, source of truth for both routes:
- `report_content jsonb not null` — the generated report, shape `Record<string, string>`.
- `report_version int`, `is_edited boolean`.
- `client_report_content jsonb` — client-rewritten version (phase 2, /client only).
- `client_report_translations jsonb default '{}'` — translation cache for the CLIENT report (not to be confused with the practitioner viewer's language toggle, which is purely client-side state and never persisted here).
- No language column. No "review status" column.

**`client_analyses`** (line 149) — the paid flow, has no real patient_id/session_id:
- `payment_tier` (`basic_1990` | `premium_2990`), `status` (6 values: intake_pending → paid → analyzing → stage2_processing → completed | failed), `language` (en/es/de, default 'es'), `main_complaint`, `current_medications`, `health_questionnaire jsonb`, `report_id` (fk to `reports`, nullable).

**`report_corrections`** (line 113) — history of the practitioner's edits to past reports, keyed by `patient_id` + `section_key`. This is what gets re-injected as "PRACTITIONER CORRECTIONS" (see generation-pipeline.md, P3).

## Types (src/types/report.ts)

- `REPORT_SECTION_KEYS` (14, lines 7-21): general_terrain, emotional_field, cognitive_nervous, immune_lymphatic, endocrine_hormonal, circulatory_cardiorespiratory, hepatic, digestive_intestinal, renal_urinary, structural_integumentary, detected_axes, conclusion, strengths_of_the_body, recommendations.
- `PRACTITIONER_ONLY_SECTION_KEYS` (line 31): `section_15_iris_sign_patterns` — deliberately excluded from the list above so client-facing code (writing-pipeline, client-report-viewer, report-pdf-document, all keyed off `REPORT_SECTION_KEYS`) never sees it. The client route additionally strips it as a belt-and-braces guard.
- `ReportContent = Record<string, string>` — free prose per section, no sub-structure. This is the technical root of why "not detected" and "normal" collapse into the same thing — there's no field to distinguish them.
- The **comparison** report (`src/types/comparison-report.ts`) is a DIFFERENT shape: 2 keys (`comp_1_improvements`, `comp_2_not_improved`), detected via `isComparisonReport()` (looks for keys starting with `comp_`). `getOrderedSectionKeys()` picks the right canon based on the shape of the content it receives.

## Why the 14(+1) count is invariant

At least 3 places assume that exact shape without validating it dynamically: the client PDF renderer, the client report viewer, and the belt-and-braces filter in the `/api/client/reports/[token]` route. Changing the section count without auditing those 3 sites breaks the app silently.
