# Iridiology App — Three Critical Fixes Design

**Date:** 2026-04-24  
**Status:** Approved  
**Scope:** Client analysis flow (`src/app/client/`, `src/app/api/client/`, `src/lib/client/`, `src/lib/claude/`)

---

## Issue 1 — PDF Email (no storage, idempotent)

### Root Cause

The email currently sends a bare link to `/client/report/[token]`. That page contains polling logic — opening the link re-enters the live app flow. No deduplication exists; the email endpoint can be called multiple times for the same analysis. This creates the risk of infinite loops and duplicate emails.

### Architecture

**PDF generation library:** `@react-pdf/renderer`
- Pure JavaScript, no native binaries — Vercel-compatible
- `renderToBuffer(<ReportPdfDocument />)` produces a `Buffer` in memory
- Buffer passed directly to Resend's `attachments` field — never touches disk or storage
- No PDF stored anywhere (data protection requirement)

**New component:** `src/components/client/report-pdf-document.tsx`
- A `@react-pdf/renderer` React component mirroring the 12-section report structure
- Accepts the same `report` JSON shape as `client-report-viewer.tsx`
- Styled with `@react-pdf/renderer` primitives (View, Text, StyleSheet)

**Trigger point:** Inside the existing `POST /api/client/upload` handler, after analysis completes and `status = 'completed'`:
1. Check `email_send_log` for existing sent record for this `analysis_id`
2. If already sent → skip (idempotency guard)
3. Generate PDF buffer via `renderToBuffer`
4. Send email via Resend with PDF as attachment
5. Insert log row with `status = 'sent'`
6. On Resend failure: insert log row with `status = 'failed'`, do not retry automatically

**Email content:**
- Subject: localised (EN/ES)
- Body: "Your iridiology report is attached as a PDF."
- Attachment: `iridiology-report.pdf` (the generated buffer)
- Any link: points only to `/client/thankyou` — a fully static page with no DB reads and no generation logic

**New static page:** `src/app/client/thankyou/page.tsx`
- Server component, no dynamic data
- Simple "Thank you for your purchase" message
- No token, no query params, no API calls

### Data Model Changes

**New migration:** `docs/migrations/006-email-send-log.sql`

```sql
CREATE TABLE email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES client_analyses(id),
  recipient_email TEXT NOT NULL,
  payment_tier TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id)  -- one send attempt per analysis
);

ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access" ON email_send_log FOR ALL USING (false);
```

### Key Constraints

- PDF generation runs server-side inside the API route (Node.js runtime, not Edge)
- `@react-pdf/renderer` `renderToBuffer` is async (returns `Promise<Buffer>`) — awaited inside the API route handler
- Idempotency key is `analysis_id` (not `payment_id`) — one analysis = one email
- The manual "resend" button in `client-report-viewer.tsx` must also check `email_send_log` before sending

---

## Issue 2 — Language Injection in AI Prompt

### Root Cause

In `src/lib/claude/prompts.ts`, `getStandardAnalysisSystemPrompt(language)` accepts a `language` parameter but the function body contains a hardcoded override:

```
LANGUAGE: Write ALL report content exclusively in English, regardless of the patient's name, nationality, or any other context.
```

This overrides the parameter entirely. The language value IS stored in `client_analyses.language` and IS passed through the call chain — it just gets silently discarded at the prompt level.

### Architecture

**Prompt fix:** Remove the hardcoded English instruction. Replace with a language-aware directive at the top of the system prompt:

```
LANGUAGE DIRECTIVE: You MUST write the ENTIRE report in {languageName}. Do not use any other language 
under any circumstance. Never default to English unless the language is explicitly set to English. 
Write every section, every sentence, every word in {languageName}.
```

Where `languageName` is derived from the `language` code:
- `'en'` → `'English'`
- `'es'` → `'Spanish (Español)'`
- `'fr'` → `'French (Français)'`

The `language` parameter already flows from `client_analyses.language` through to `getStandardAnalysisSystemPrompt(language)` — the fix is entirely inside `prompts.ts`.

**Post-generation language detection:** Add `tinyld` (~15KB, pure JS, no native deps, Vercel-safe).

After generation, run language detection on `section_1_general_terrain` (longest/most representative section):

```typescript
import { detect } from 'tinyld'

const detectedLang = detect(report.section_1_general_terrain)
if (detectedLang !== userLanguage) {
  // Retry once with amplified directive
  // If retry also fails: set client_analyses.language_flag = true, do not deliver
}
```

**New column:** `language_flag BOOLEAN DEFAULT FALSE` on `client_analyses` — set to `true` if generation fails language check after 1 retry. Flagged reports are not delivered and require manual review.

### Files Modified

- `src/lib/claude/prompts.ts` — remove hardcoded English directive, inject language variable
- `src/app/api/client/upload/route.ts` — add post-generation language check + retry logic
- `docs/migrations/007-language-flag.sql` — add `language_flag` column

### Verified Languages

`en` (English), `es` (Spanish), `fr` (French). The existing i18n system already has ES translations; FR is for the AI output only (no UI translation required for this fix).

---

## Issue 3 — Multi-Agent Writing Pipeline for `/client` Report

### Root Cause

No distinction exists between client and practitioner report output. The same 12-section clinical markdown JSON is rendered to both audiences. The client view contains fiber density references, zone numbers, hedging language, and clinical terminology that non-medical clients cannot interpret.

### Architecture

**Pipeline position:** After the main analysis completes (client analyses only), before the email send. Triggered inside `POST /api/client/upload` — this route is client-only by definition, so the pipeline always runs here and never affects practitioner sessions.

**Storage:** New column `client_report_content JSONB` on the `reports` table (same 12-key structure as `report_content`). The practitioner view always reads `report_content`. The client API endpoint (`GET /api/client/reports/[token]`) returns `client_report_content` if present, falls back to `report_content` if not.

**New migration:** `docs/migrations/008-client-report-content.sql`

```sql
ALTER TABLE reports ADD COLUMN client_report_content JSONB;
```

### Pipeline Design

All 12 sections run their 4-agent pipeline **in parallel** (`Promise.all`). Total latency = 4 sequential Claude calls (waves), not 48 serial calls.

**Agent model:** `claude-sonnet-4-6` for all 4 agents (already used in premium tier, strong writing quality, adaptive thinking available).

#### Agent 1 — Analyst

Receives the raw clinical finding text (read-only). Extracts a structured representation:

```
SYSTEM: You are an iridology clinical analyst. Extract the key finding from this report section as structured data.
Return JSON: { "finding": "...", "bodySystem": "...", "clinicalObservation": "..." }
Do NOT interpret or editorialize. Extract only what is stated.
```

Output: structured JSON (parsed in the pipeline, server-side).

#### Agent 2 — Translator

Receives the structured finding. Converts to plain language:

```
SYSTEM: You are a health communicator writing for non-medical clients.
Convert this clinical iridology finding into plain language that a non-doctor can understand.
Focus on: what this means for the client's body or health experience.
Do NOT mention: iris, fibers, zones, sectors, pigments, lacunae, or any clinical observation tool.
Write 2-3 sentences maximum.
```

Output: plain-language paragraph.

#### Agent 3 — Editor

Receives the translator output. Applies strict rules:

```
SYSTEM: You are an editor enforcing strict communication rules for a health report.
Apply these rules to the text you receive:
- NO fiber descriptions (fiber density, fiber structure, iris zone numbers)
- NO technical jargon a non-doctor would not understand
- NO vague or hedging language ("may", "could suggest", "might be", "it is possible that")
- Every sentence must carry direct interpretive value for the client
- Maximum 2 sentences total
- Tone: clinical but human. Say what it means for the client, not what was observed.
If the text passes all rules, return it unchanged. If it fails, rewrite it to comply.
Return only the final text, nothing else.
```

Output: edited text (max 2 sentences).

#### Agent 4 — QA

Receives the editor output. Final gate:

```
SYSTEM: You are a QA reviewer for a client-facing health report.
Check every sentence against these rules:
1. No fiber/zone/sector/iris observation language
2. No hedging words: may, might, could, possibly, perhaps, it seems
3. Every sentence directly tells the client something about their health
4. Maximum 2 sentences
5. Tone is direct and human, not clinical

For each sentence that FAILS: rewrite it to pass.
For each sentence that PASSES: keep it exactly as-is.
Return ONLY the final approved text. No commentary, no explanations.
```

Output: final approved text — this is what reaches the client.

### Client Report API Change

`GET /api/client/reports/[token]` returns:

```typescript
{
  language: string,
  report: analysis.client_report_content ?? analysis.report_content,
  isClientRewritten: !!analysis.client_report_content
}
```

Practitioner routes (`/reports/[id]`) are untouched — they always read `report_content` directly.

### Error Handling

If the pipeline fails for any section (Claude error, timeout, parse error): that section falls back to the original `report_content` text for that section. A partial failure does not block email delivery. Failures are logged to console (no new DB column needed — this is a best-effort quality enhancement, not a delivery gate).

---

## Summary of New Files

| File | Purpose |
|---|---|
| `src/components/client/report-pdf-document.tsx` | @react-pdf/renderer component for PDF generation |
| `src/app/client/thankyou/page.tsx` | Static thank-you page (no generation logic) |
| `src/lib/client/pdf.ts` | PDF generation helper (renderToBuffer wrapper) |
| `src/lib/client/writing-pipeline.ts` | 4-agent rewriting pipeline |
| `docs/migrations/006-email-send-log.sql` | email_send_log table |
| `docs/migrations/007-language-flag.sql` | language_flag column on client_analyses |
| `docs/migrations/008-client-report-content.sql` | client_report_content column on reports |

## Summary of Modified Files

| File | Change |
|---|---|
| `src/lib/claude/prompts.ts` | Remove hardcoded English directive, inject language variable |
| `src/app/api/client/upload/route.ts` | Add PDF gen, email log check, language detection, writing pipeline |
| `src/lib/client/email.ts` | Switch from link-only to PDF attachment email |
| `src/app/api/client/reports/[token]/route.ts` | Return client_report_content if present |
| `src/app/api/client/reports/[token]/email/route.ts` | Add email_send_log idempotency check |

## Dependencies to Add

```json
"@react-pdf/renderer": "^4.x",
"tinyld": "^1.x"
```
