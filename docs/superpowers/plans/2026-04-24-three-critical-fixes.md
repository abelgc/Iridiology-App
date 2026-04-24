# Three Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three production issues: PDF-attachment email (no storage, idempotent), language injection in AI prompts, and a 4-agent client report rewriting pipeline.

**Architecture:** Three independent chains all converging on `POST /api/client/upload/route.ts`. Issue 2 is a single prompt edit. Issue 1 adds a new `email_send_log` table + `@react-pdf/renderer` generation. Issue 3 adds a `writing-pipeline.ts` module + `client_report_content` DB column.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (PostgreSQL), Resend, `@anthropic-ai/sdk`, `@react-pdf/renderer`, `tinyld`, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `docs/migrations/006-email-send-log.sql` | Create | email_send_log table |
| `docs/migrations/007-language-flag.sql` | Create | language_flag column |
| `docs/migrations/008-client-report-content.sql` | Create | client_report_content column |
| `src/lib/claude/prompts.ts` | Modify | Remove hardcoded English, inject language |
| `src/lib/client/writing-pipeline.ts` | Create | 4-agent rewriting pipeline |
| `src/lib/client/pdf.ts` | Create | renderToBuffer wrapper |
| `src/components/client/report-pdf-document.tsx` | Create | @react-pdf/renderer component |
| `src/lib/client/email.ts` | Modify | PDF attachment + idempotency check |
| `src/app/api/client/upload/route.ts` | Modify | Language check, writing pipeline, new email flow |
| `src/app/api/client/reports/[token]/route.ts` | Modify | Return client_report_content if present |
| `src/app/api/client/reports/[token]/email/route.ts` | Modify | Idempotency check before resend |
| `src/app/client/thankyou/page.tsx` | Create | Static thank-you page |
| `src/types/client-analysis.ts` | Modify | Add `fr` to Lang type |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install @react-pdf/renderer tinyld
npm install --save-dev @types/react-pdf
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('@react-pdf/renderer'); require('tinyld'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @react-pdf/renderer and tinyld"
```

---

## Task 2: DB migrations

**Files:**
- Create: `docs/migrations/006-email-send-log.sql`
- Create: `docs/migrations/007-language-flag.sql`
- Create: `docs/migrations/008-client-report-content.sql`

- [ ] **Step 1: Create migration 006**

Create `docs/migrations/006-email-send-log.sql`:

```sql
-- Track email sends to prevent duplicates
CREATE TABLE IF NOT EXISTS email_send_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id   UUID NOT NULL REFERENCES client_analyses(id),
  recipient_email TEXT NOT NULL,
  payment_tier  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id)
);

ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access" ON email_send_log FOR ALL USING (false);
```

- [ ] **Step 2: Create migration 007**

Create `docs/migrations/007-language-flag.sql`:

```sql
-- Flag reports where language detection failed after retry
ALTER TABLE client_analyses
  ADD COLUMN IF NOT EXISTS language_flag BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 3: Create migration 008**

Create `docs/migrations/008-client-report-content.sql`:

```sql
-- Client-facing rewritten report (plain language, no clinical jargon)
-- Falls back to report_content if NULL
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS client_report_content JSONB;
```

- [ ] **Step 4: Apply all three migrations in Supabase**

In the Supabase dashboard SQL editor, run each migration file in order (006, 007, 008).

Verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('email_send_log', 'client_analyses', 'reports')
  AND column_name IN ('analysis_id', 'language_flag', 'client_report_content');
```

Expected: 3 rows returned.

- [ ] **Step 5: Commit**

```bash
git add docs/migrations/006-email-send-log.sql docs/migrations/007-language-flag.sql docs/migrations/008-client-report-content.sql
git commit -m "feat: add DB migrations for email log, language flag, client report content"
```

---

## Task 3: Fix language injection in AI prompt

**Files:**
- Modify: `src/lib/claude/prompts.ts`
- Modify: `src/types/client-analysis.ts`

The `getStandardAnalysisSystemPrompt` function currently returns a Spanish or English prompt, but both prompts contain a hardcoded line: `LANGUAGE: Write ALL report content exclusively in English...`. This overrides whatever language was passed in.

- [ ] **Step 1: Write the failing test**

Create `src/lib/claude/__tests__/prompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getStandardAnalysisSystemPrompt } from '../prompts'

describe('getStandardAnalysisSystemPrompt', () => {
  it('includes a Spanish language directive when lang is es', () => {
    const prompt = getStandardAnalysisSystemPrompt('es')
    expect(prompt).toContain('Spanish')
    expect(prompt).not.toContain('exclusively in English')
  })

  it('includes a French language directive when lang is fr', () => {
    const prompt = getStandardAnalysisSystemPrompt('fr')
    expect(prompt).toContain('French')
    expect(prompt).not.toContain('exclusively in English')
  })

  it('includes an English language directive when lang is en', () => {
    const prompt = getStandardAnalysisSystemPrompt('en')
    expect(prompt).toContain('English')
    expect(prompt).not.toContain('exclusively in English')
  })

  it('never contains the hardcoded override phrase for any lang', () => {
    for (const lang of ['en', 'es', 'fr'] as const) {
      expect(getStandardAnalysisSystemPrompt(lang)).not.toContain(
        'Write ALL report content exclusively in English'
      )
    }
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/claude/__tests__/prompts.test.ts
```

Expected: FAIL — "includes a Spanish language directive when lang is es"

- [ ] **Step 3: Add `fr` to the `Lang` type**

In `src/types/client-analysis.ts`, line 1:

```typescript
export type Lang = 'en' | 'es' | 'fr'
```

- [ ] **Step 4: Rewrite `getStandardAnalysisSystemPrompt` in `src/lib/claude/prompts.ts`**

Replace lines 265–267 (the `getStandardAnalysisSystemPrompt` export) and add a language directive builder above it. Keep all existing prompt constants unchanged — only add the new function and directive builder.

Add after line 263 (after the `JYOTISH_ENHANCEMENT_SYSTEM_PROMPT` constant) and replace the existing `getStandardAnalysisSystemPrompt`:

```typescript
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
}

function buildLanguageDirective(lang: string): string {
  const languageName = LANGUAGE_NAMES[lang] ?? 'English'
  return `LANGUAGE DIRECTIVE: You MUST write the ENTIRE report in ${languageName}. Do not use any other language under any circumstance. Never default to English unless the language is explicitly set to English. Write every section, every sentence, every word in ${languageName}.`
}

export function getStandardAnalysisSystemPrompt(lang: 'en' | 'es' | 'fr'): string {
  const languageDirective = buildLanguageDirective(lang)
  // Base prompt is STANDARD_ANALYSIS_SYSTEM_PROMPT_EN for all languages —
  // the clinical logic is the same; only the output language changes.
  const base = STANDARD_ANALYSIS_SYSTEM_PROMPT_EN
  // Replace the hardcoded English-only instruction with the dynamic directive
  return base.replace(
    'LANGUAGE: Write ALL report content exclusively in English, regardless of the patient\'s name, nationality, or any other context. JSON keys are identifiers only — do not infer language from them.',
    languageDirective
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- src/lib/claude/__tests__/prompts.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts src/types/client-analysis.ts
git commit -m "fix(prompt): inject language directive instead of hardcoded English-only instruction"
```

---

## Task 4: Post-generation language detection in upload route

**Files:**
- Modify: `src/app/api/client/upload/route.ts`

Add `tinyld` language detection after the report is generated. If the detected language does not match the requested language, retry once with an amplified directive. If it still fails, set `language_flag = true` on the analysis and skip email delivery.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/client/__tests__/language-check.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectsCorrectLanguage } from '../upload/language-check'

describe('detectsCorrectLanguage', () => {
  it('returns true when text is in the expected language', () => {
    expect(detectsCorrectLanguage('The digestive system shows signs of chronic stress.', 'en')).toBe(true)
  })

  it('returns false when text language does not match expected', () => {
    expect(detectsCorrectLanguage('El sistema digestivo muestra signos de estrés.', 'en')).toBe(false)
  })

  it('returns true for Spanish text with es lang', () => {
    expect(detectsCorrectLanguage('El sistema digestivo muestra signos de estrés crónico.', 'es')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/app/api/client/__tests__/language-check.test.ts
```

Expected: FAIL — cannot find module `language-check`

- [ ] **Step 3: Create `src/app/api/client/upload/language-check.ts`**

```typescript
import { detect } from 'tinyld'

export function detectsCorrectLanguage(text: string, expectedLang: string): boolean {
  if (!text || text.length < 50) return true // too short to detect reliably
  const detected = detect(text)
  return detected === expectedLang
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/app/api/client/__tests__/language-check.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/client/upload/language-check.ts src/app/api/client/__tests__/language-check.test.ts
git commit -m "feat: add language detection helper using tinyld"
```

---

## Task 5: Writing pipeline (4-agent rewriting)

**Files:**
- Create: `src/lib/client/writing-pipeline.ts`

This module takes a `ReportContent` (12 sections) and returns a new `ReportContent` with each section rewritten through 4 sequential Claude API calls. All 12 sections run in parallel.

- [ ] **Step 1: Write the failing test**

Create `src/lib/client/__tests__/writing-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Mock the Anthropic SDK before importing the module
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Your digestive system shows signs of chronic stress.' }],
        stop_reason: 'end_turn',
      }),
    },
  })),
}))

import { rewriteReportForClient } from '../writing-pipeline'
import type { ReportContent } from '@/types/report'

const mockReport: ReportContent = {
  section_1_general_terrain: 'Dense fiber structure in zone 4 indicates hepatic congestion with lacunar formations.',
  section_2_emotional_field: 'Autonomic dysregulation visible in collarette irregularity.',
  section_3_cognitive_nervous: 'Nervous ring present with fiber compression in sector 11.',
  section_4_immune_lymphatic: 'Lymphatic rosette observed peripherally.',
  section_5_endocrine_hormonal: 'Thyroid zone shows pigmentation.',
  section_6_circulatory_cardiorespiratory: 'Cardiac zone fiber density elevated.',
  section_7_hepatic: 'Hepatic sector shows lacunar formations.',
  section_8_digestive_intestinal: 'Intestinal zone fiber density reduced.',
  section_9_renal_urinary: 'Renal zone pigmentation noted.',
  section_10_structural_integumentary: 'Structural zone fibers intact.',
  section_11_detected_axes: 'Axis: liver and digestive system and skin elimination',
  section_12_conclusion: 'Overall constitutional weakness with hepatic burden.',
}

describe('rewriteReportForClient', () => {
  it('returns a ReportContent with the same 12 keys', async () => {
    const result = await rewriteReportForClient(mockReport, 'en')
    expect(Object.keys(result)).toHaveLength(12)
    expect(result.section_1_general_terrain).toBeDefined()
    expect(result.section_12_conclusion).toBeDefined()
  })

  it('returns non-empty strings for each section', async () => {
    const result = await rewriteReportForClient(mockReport, 'en')
    for (const key of Object.keys(result)) {
      expect(result[key as keyof typeof result].length).toBeGreaterThan(0)
    }
  })

  it('falls back to original section text if pipeline throws', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    vi.mocked(Anthropic).mockImplementationOnce(() => ({
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API error')),
      },
    } as any))

    const result = await rewriteReportForClient(mockReport, 'en')
    // Should not throw; falls back gracefully
    expect(result.section_1_general_terrain).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/client/__tests__/writing-pipeline.test.ts
```

Expected: FAIL — cannot find module `../writing-pipeline`

- [ ] **Step 3: Create `src/lib/client/writing-pipeline.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS } from '@/types/report'

const MODEL = 'claude-sonnet-4-6'

async function callClaude(client: Anthropic, systemPrompt: string, userContent: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })
  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : ''
}

async function rewriteSection(client: Anthropic, rawText: string, lang: string): Promise<string> {
  // Agent 1: Analyst — extract structured finding (read-only)
  const analystOut = await callClaude(
    client,
    `You are an iridology clinical analyst. Extract the key finding from this report section as structured data.
Return JSON only: { "finding": "...", "bodySystem": "...", "clinicalObservation": "..." }
Do NOT interpret or editorialize. Extract only what is stated. Return valid JSON and nothing else.`,
    rawText
  )

  let structured: { finding: string; bodySystem: string; clinicalObservation: string }
  try {
    structured = JSON.parse(analystOut)
  } catch {
    structured = { finding: rawText, bodySystem: 'unknown', clinicalObservation: rawText }
  }

  // Agent 2: Translator — plain language for non-medical client
  const translatorOut = await callClaude(
    client,
    `You are a health communicator writing for non-medical clients. Write in ${lang === 'es' ? 'Spanish' : lang === 'fr' ? 'French' : 'English'}.
Convert this clinical iridology finding into plain language a non-doctor can understand.
Focus on: what this means for the client's body or health experience.
Do NOT mention: iris, fibers, zones, sectors, pigments, lacunae, or any clinical observation instrument.
Write 2-3 sentences maximum. Return only the plain text, no JSON.`,
    JSON.stringify(structured)
  )

  // Agent 3: Editor — enforce rules
  const editorOut = await callClaude(
    client,
    `You are an editor enforcing strict communication rules for a client-facing health report. Write in ${lang === 'es' ? 'Spanish' : lang === 'fr' ? 'French' : 'English'}.
Apply these rules:
- NO fiber descriptions (fiber density, fiber structure, iris zone numbers)
- NO technical jargon a non-doctor would not understand
- NO vague or hedging language (may, could suggest, might be, it is possible that, perhaps)
- Every sentence must carry direct interpretive value for the client
- Maximum 2 sentences total
- Tone: clinical but human — say what it means for the client, not what was observed
If the text passes all rules, return it unchanged. If it fails, rewrite to comply.
Return ONLY the final text, nothing else.`,
    translatorOut
  )

  // Agent 4: QA — final gate
  const qaOut = await callClaude(
    client,
    `You are a QA reviewer for a client-facing health report. Write in ${lang === 'es' ? 'Spanish' : lang === 'fr' ? 'French' : 'English'}.
Check every sentence against these rules:
1. No fiber/zone/sector/iris observation language
2. No hedging words: may, might, could, possibly, perhaps, it seems
3. Every sentence directly tells the client something about their health
4. Maximum 2 sentences
5. Tone is direct and human, not clinical
For each sentence that FAILS: rewrite it to pass.
For each sentence that PASSES: keep it exactly as-is.
Return ONLY the final approved text. No commentary, no explanations.`,
    editorOut
  )

  return qaOut || editorOut || translatorOut || rawText
}

export async function rewriteReportForClient(
  report: ReportContent,
  lang: string
): Promise<ReportContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return report

  const client = new Anthropic({ apiKey })

  const rewrites = await Promise.all(
    REPORT_SECTION_KEYS.map(async (key: ReportSectionKey) => {
      try {
        const rewritten = await rewriteSection(client, report[key], lang)
        return [key, rewritten || report[key]] as const
      } catch {
        // Per-section fallback: keep original on any error
        return [key, report[key]] as const
      }
    })
  )

  return Object.fromEntries(rewrites) as ReportContent
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/client/__tests__/writing-pipeline.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/writing-pipeline.ts src/lib/client/__tests__/writing-pipeline.test.ts
git commit -m "feat: add 4-agent client report rewriting pipeline"
```

---

## Task 6: PDF generation helper and component

**Files:**
- Create: `src/components/client/report-pdf-document.tsx`
- Create: `src/lib/client/pdf.ts`

- [ ] **Step 1: Create `src/components/client/report-pdf-document.tsx`**

```typescript
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { ReportContent, ReportSectionKey } from '@/types/report'
import { REPORT_SECTION_KEYS, REPORT_SECTION_LABELS } from '@/types/report'

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    color: '#2c3e50',
  },
  sectionBody: {
    lineHeight: 1.6,
    color: '#333',
  },
})

interface Props {
  report: ReportContent
  generatedAt: string
}

export function ReportPdfDocument({ report, generatedAt }: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Iridology Analysis Report</Text>
          <Text style={styles.subtitle}>Generated: {generatedAt}</Text>
        </View>

        {REPORT_SECTION_KEYS.map((key: ReportSectionKey) => (
          <View key={key} style={styles.section}>
            <Text style={styles.sectionTitle}>{REPORT_SECTION_LABELS[key]}</Text>
            <Text style={styles.sectionBody}>{report[key]}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Create `src/lib/client/pdf.ts`**

```typescript
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ReportPdfDocument } from '@/components/client/report-pdf-document'
import type { ReportContent } from '@/types/report'

export async function generateReportPdf(report: ReportContent): Promise<Buffer> {
  const generatedAt = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const element = React.createElement(ReportPdfDocument, { report, generatedAt })
  return await renderToBuffer(element)
}
```

- [ ] **Step 3: Write a smoke test**

Create `src/lib/client/__tests__/pdf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateReportPdf } from '../pdf'
import type { ReportContent } from '@/types/report'

const mockReport: ReportContent = {
  section_1_general_terrain: 'Your body shows a strong constitutional foundation.',
  section_2_emotional_field: 'Your nervous system is under moderate stress.',
  section_3_cognitive_nervous: 'Cognitive function appears stable.',
  section_4_immune_lymphatic: 'Immune system is functioning well.',
  section_5_endocrine_hormonal: 'Hormonal balance shows minor imbalance.',
  section_6_circulatory_cardiorespiratory: 'Cardiovascular system appears healthy.',
  section_7_hepatic: 'Liver function shows some congestion.',
  section_8_digestive_intestinal: 'Digestive system shows signs of stress.',
  section_9_renal_urinary: 'Kidney function is within normal range.',
  section_10_structural_integumentary: 'Structural integrity is good.',
  section_11_detected_axes: 'Axis: liver and digestive system',
  section_12_conclusion: 'Overall health is good with some areas for improvement.',
}

describe('generateReportPdf', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await generateReportPdf(mockReport)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(1000)
  }, 15000) // PDF generation can be slow on first run

  it('starts with PDF magic bytes', async () => {
    const buf = await generateReportPdf(mockReport)
    // PDFs start with %PDF
    expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF')
  }, 15000)
})
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/client/__tests__/pdf.test.ts
```

Expected: PASS (2 tests) — may take ~5-10s on first run

- [ ] **Step 5: Commit**

```bash
git add src/components/client/report-pdf-document.tsx src/lib/client/pdf.ts src/lib/client/__tests__/pdf.test.ts
git commit -m "feat: add PDF generation component and helper"
```

---

## Task 7: Update email helper to send PDF attachment

**Files:**
- Modify: `src/lib/client/email.ts`

Replace the link-only email with a PDF attachment email. The function signature changes to accept a `pdfBuffer` and `analysisId` and write to `email_send_log`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/client/__tests__/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'resend-123' }, error: null }),
    },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

import { sendReportEmail } from '../email'

describe('sendReportEmail', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.RESEND_FROM_EMAIL = 'test@example.com'
    process.env.CLIENT_APP_BASE_URL = 'https://example.com'
  })

  it('returns ok: true on successful send', async () => {
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'premium_19_90',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('resend-123')
  })

  it('returns ok: false when env vars are missing', async () => {
    delete process.env.RESEND_API_KEY
    const result = await sendReportEmail({
      to: 'user@example.com',
      lang: 'en',
      analysisId: 'analysis-uuid-123',
      paymentTier: 'basic_12',
      pdfBuffer: Buffer.from('%PDF-test'),
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('email_not_configured')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- src/lib/client/__tests__/email.test.ts
```

Expected: FAIL — `sendReportEmail` signature mismatch

- [ ] **Step 3: Rewrite `src/lib/client/email.ts`**

```typescript
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import type { Lang } from '@/types/client-analysis'

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Iridology Analysis Report',
  es: 'Tu Informe de Análisis de Iridología',
  fr: 'Votre Rapport d\'Analyse d\'Iridologie',
}

const BODY_INTRO: Record<Lang, string> = {
  en: 'Your iridology report is attached to this email as a PDF. You own this file and can save it at any time.',
  es: 'Tu informe de iridología está adjunto a este correo como PDF. Este archivo es tuyo y puedes guardarlo cuando quieras.',
  fr: 'Votre rapport d\'iridologie est joint à cet e-mail en PDF. Ce fichier vous appartient et vous pouvez le sauvegarder à tout moment.',
}

const THANK_YOU_TEXT: Record<Lang, string> = {
  en: 'Thank you for your purchase.',
  es: 'Gracias por tu compra.',
  fr: 'Merci pour votre achat.',
}

export async function sendReportEmail(params: {
  to: string
  lang: Lang
  analysisId: string
  paymentTier: string
  pdfBuffer: Buffer
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const baseUrl = process.env.CLIENT_APP_BASE_URL

  if (!apiKey || !from || !baseUrl) {
    return { ok: false, error: 'email_not_configured' }
  }

  const supabase = createAdminClient()

  // Idempotency check — never send twice for the same analysis
  const { data: existing } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('analysis_id', params.analysisId)
    .eq('status', 'sent')
    .single()

  if (existing) {
    return { ok: true, id: 'already_sent' }
  }

  const subject = SUBJECTS[params.lang]
  const intro = BODY_INTRO[params.lang]
  const thankYou = THANK_YOU_TEXT[params.lang]
  const thankYouUrl = `${baseUrl}/client/thankyou`

  const html = `
    <p>${intro}</p>
    <p>${thankYou} <a href="${thankYouUrl}">${thankYouUrl}</a></p>
  `

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      attachments: [
        {
          filename: 'iridology-report.pdf',
          content: params.pdfBuffer,
        },
      ],
    })

    const status = error ? 'failed' : 'sent'
    await supabase.from('email_send_log').insert({
      analysis_id: params.analysisId,
      recipient_email: params.to,
      payment_tier: params.paymentTier,
      status,
    })

    if (error) return { ok: false, error: String(error) }
    return { ok: true, id: data?.id }
  } catch (err) {
    await supabase.from('email_send_log').insert({
      analysis_id: params.analysisId,
      recipient_email: params.to,
      payment_tier: params.paymentTier,
      status: 'failed',
    }).catch(() => {}) // best-effort log

    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/lib/client/__tests__/email.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/email.ts src/lib/client/__tests__/email.test.ts
git commit -m "feat: send PDF attachment email with idempotency guard"
```

---

## Task 8: Wire everything into the upload route

**Files:**
- Modify: `src/app/api/client/upload/route.ts`

Add: language detection + retry, writing pipeline, PDF generation, updated `sendReportEmail` call.

- [ ] **Step 1: Replace `src/app/api/client/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientUploadSchema } from '@/lib/validators/client-upload'
import { analyze } from '@/lib/claude/analyze'
import { ReportContent } from '@/types/report'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
} from '@/lib/claude/enhance-emotional-field'
import { sendReportEmail } from '@/lib/client/email'
import { getModelForTier } from '@/lib/ai/get-provider'
import { detectsCorrectLanguage } from './language-check'
import { rewriteReportForClient } from '@/lib/client/writing-pipeline'
import { generateReportPdf } from '@/lib/client/pdf'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = clientUploadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const { data: row, error: loadError } = await supabase
    .from('client_analyses')
    .select('*')
    .eq('report_download_token', parsed.data.report_download_token)
    .single()

  if (loadError || !row) {
    return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 })
  }

  if (row.status !== 'paid') {
    return NextResponse.json({ error: 'payment_required' }, { status: 402 })
  }

  await supabase
    .from('client_analyses')
    .update({ status: 'analyzing' })
    .eq('report_download_token', parsed.data.report_download_token)

  try {
    const modelId = getModelForTier(row.payment_tier)

    // Generate report (attempt 1)
    let reportContent = await analyze({
      images: [parsed.data.right_eye_base64, parsed.data.left_eye_base64],
      patient: {
        full_name: row.email ?? 'Client',
        date_of_birth: row.date_of_birth,
        general_history: '',
        symptoms: row.main_complaint ?? '',
        practitioner_notes: row.current_medications
          ? `Current medications: ${row.current_medications}`
          : '',
      },
      health_questionnaire: (row.health_questionnaire as Record<string, unknown> | null) ?? null,
      language: row.language,
      modelId,
    })

    if ('code' in reportContent) {
      throw new Error(`Analysis failed: ${reportContent.message}`)
    }

    // Language check — retry once if wrong language detected
    const languageOk = detectsCorrectLanguage(
      (reportContent as ReportContent).section_1_general_terrain,
      row.language
    )

    if (!languageOk) {
      const retry = await analyze({
        images: [parsed.data.right_eye_base64, parsed.data.left_eye_base64],
        patient: {
          full_name: row.email ?? 'Client',
          date_of_birth: row.date_of_birth,
          general_history: '',
          symptoms: row.main_complaint ?? '',
          practitioner_notes: row.current_medications
            ? `Current medications: ${row.current_medications}`
            : '',
        },
        health_questionnaire: (row.health_questionnaire as Record<string, unknown> | null) ?? null,
        language: row.language,
        modelId,
        forceLanguage: true, // triggers amplified directive — see Task 9
      })

      if (!('code' in retry)) {
        const retryOk = detectsCorrectLanguage(
          (retry as ReportContent).section_1_general_terrain,
          row.language
        )
        if (retryOk) {
          reportContent = retry
        } else {
          // Both attempts failed — flag for manual review, do not deliver
          await supabase
            .from('client_analyses')
            .update({ language_flag: true })
            .eq('report_download_token', parsed.data.report_download_token)
          return NextResponse.json(
            { report_download_token: parsed.data.report_download_token, language_flag: true },
            { status: 200 },
          )
        }
      }
    }

    let finalReport = reportContent as ReportContent

    // Jyotish enhancement (optional)
    if (
      shouldEnhanceWithJyotish({
        date_of_birth: row.date_of_birth,
        country_of_birth: row.country_of_birth,
        city_of_birth: row.city_of_birth,
        time_of_day: row.time_of_day,
      })
    ) {
      finalReport = await enhanceEmotionalFieldWithJyotish(
        reportContent as ReportContent,
        'Client',
        {
          date_of_birth: row.date_of_birth,
          country_of_birth: row.country_of_birth,
          city_of_birth: row.city_of_birth,
          time_of_day: row.time_of_day,
        },
        row.language,
      )
    }

    // Rewrite for client (4-agent pipeline) — runs in parallel with DB insert below
    const clientReportPromise = rewriteReportForClient(finalReport, row.language)

    // Insert practitioner report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        report_content: finalReport,
        report_version: 1,
        is_edited: false,
      })
      .select('id')
      .single()

    if (reportError || !report) throw new Error(reportError?.message ?? 'report_insert_failed')

    // Wait for client rewrite and save
    const clientReportContent = await clientReportPromise
    await supabase
      .from('reports')
      .update({ client_report_content: clientReportContent })
      .eq('id', report.id)

    await supabase
      .from('client_analyses')
      .update({
        status: 'completed',
        report_id: report.id,
        report_delivered_at: new Date().toISOString(),
      })
      .eq('report_download_token', parsed.data.report_download_token)

    // Generate PDF and email
    if (row.email) {
      const pdfBuffer = await generateReportPdf(clientReportContent)
      await sendReportEmail({
        to: row.email,
        lang: row.language,
        analysisId: row.id,
        paymentTier: row.payment_tier,
        pdfBuffer,
      })
    }

    return NextResponse.json(
      { report_download_token: parsed.data.report_download_token },
      { status: 200 },
    )
  } catch (err) {
    await supabase
      .from('client_analyses')
      .update({
        status: 'failed',
        failure_reason: err instanceof Error ? err.message : String(err),
      })
      .eq('report_download_token', parsed.data.report_download_token)
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/client/upload/route.ts
git commit -m "feat: wire language check, writing pipeline, and PDF email into upload route"
```

---

## Task 9: Add `forceLanguage` option to `analyze`

**Files:**
- Modify: `src/lib/claude/analyze.ts` (or wherever `analyze` is defined)

The retry in Task 8 passes `forceLanguage: true`. We need `analyze` to accept this and apply a stronger language directive.

- [ ] **Step 1: Read the current analyze function signature**

```bash
grep -n "export.*analyze" "src/lib/claude/analyze.ts"
```

- [ ] **Step 2: Add `forceLanguage` to the analyze params**

In `src/lib/claude/analyze.ts`, find the params type/interface for `analyze` and add `forceLanguage?: boolean`.

Then in the function body, where `getStandardAnalysisSystemPrompt(language)` is called, add an amplified suffix when `forceLanguage` is true:

```typescript
let systemPrompt = getStandardAnalysisSystemPrompt(language as 'en' | 'es' | 'fr')
if (forceLanguage) {
  systemPrompt = systemPrompt + '\n\nCRITICAL OVERRIDE: The ENTIRE response, every JSON value, every word MUST be written in the language specified above. Do not write a single word in any other language. This is a hard requirement.'
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude/analyze.ts
git commit -m "feat: add forceLanguage option to analyze for retry with amplified language directive"
```

---

## Task 10: Update the manual resend email endpoint

**Files:**
- Modify: `src/app/api/client/reports/[token]/email/route.ts`

This endpoint must fetch the PDF from the stored report and use the new `sendReportEmail` signature.

- [ ] **Step 1: Rewrite `src/app/api/client/reports/[token]/email/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { sendReportEmail } from '@/lib/client/email'
import { generateReportPdf } from '@/lib/client/pdf'
import type { ReportContent } from '@/types/report'

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('client_analyses')
    .select(`
      id,
      email,
      language,
      status,
      payment_tier,
      reports:report_id ( client_report_content, report_content )
    `)
    .eq('report_download_token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (data.status !== 'completed') return NextResponse.json({ error: 'not_ready' }, { status: 409 })
  if (!data.email) return NextResponse.json({ error: 'email_unavailable' }, { status: 410 })

  const reports = data.reports as any
  const reportForPdf: ReportContent =
    reports?.client_report_content ?? reports?.report_content

  if (!reportForPdf) {
    return NextResponse.json({ error: 'report_not_found' }, { status: 404 })
  }

  const pdfBuffer = await generateReportPdf(reportForPdf)

  const result = await sendReportEmail({
    to: data.email,
    lang: data.language,
    analysisId: data.id,
    paymentTier: data.payment_tier,
    pdfBuffer,
  })

  if (!result.ok && result.error !== 'already_sent' as any) {
    return NextResponse.json({ error: 'email_failed', detail: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/client/reports/[token]/email/route.ts"
git commit -m "feat: update manual resend endpoint to send PDF with idempotency guard"
```

---

## Task 11: Update the client report API to return rewritten content

**Files:**
- Modify: `src/app/api/client/reports/[token]/route.ts`

- [ ] **Step 1: Update the route**

Replace `src/app/api/client/reports/[token]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params
  if (!isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('client_analyses')
    .select(`
      report_download_token,
      language,
      status,
      report_id,
      reports:report_id ( id, report_content, client_report_content )
    `)
    .eq('report_download_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (data.status !== 'completed' || !data.reports) {
    return NextResponse.json(
      { error: 'not_ready', status: data.status },
      { status: 409 },
    )
  }

  const reports = data.reports as any
  // Return client_report_content if available, fall back to report_content
  const report = reports.client_report_content ?? reports.report_content

  return NextResponse.json({
    language: data.language,
    report,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/client/reports/[token]/route.ts"
git commit -m "feat: serve client_report_content from report API (falls back to report_content)"
```

---

## Task 12: Create static thank-you page

**Files:**
- Create: `src/app/client/thankyou/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
export default function ThankYouPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Thank you for your purchase</h1>
        <p className="text-muted-foreground">
          Your iridology report has been sent to your email as a PDF attachment.
          Please check your inbox — it may take a few minutes to arrive.
        </p>
        <p className="text-sm text-muted-foreground">
          If you do not receive it within 15 minutes, please check your spam folder.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/client/thankyou/page.tsx
git commit -m "feat: add static thank-you page for email link"
```

---

## Task 13: Run full test suite and verify build

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all tests pass (no failures)

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no type errors

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final type-check and build verification for three-fixes"
```

---

## Manual Verification Checklist

After deploying, verify in the Supabase dashboard:

- [ ] `email_send_log` table exists with RLS enabled
- [ ] `client_analyses.language_flag` column exists
- [ ] `reports.client_report_content` column exists

Then test end-to-end with a real client flow:
- [ ] Complete a client analysis in ES (Spanish) — confirm report text is in Spanish
- [ ] Confirm email arrives with PDF attachment (not a link)
- [ ] Open the PDF — confirm it contains the 12 sections
- [ ] Trigger the "resend" button on the report page — confirm it does NOT send a second email (idempotency guard fires)
- [ ] Check `email_send_log` — confirm one row with `status = 'sent'`
- [ ] Confirm `/client/thankyou` page loads with no errors

---

## Scope Note

Issues 2 and 3 share the `POST /api/client/upload` route. They are wired sequentially within that handler — language detection first, then writing pipeline, then email. If either fails, the other is unaffected (per-feature error handling). These are independent enough to be implemented in any order (Tasks 3-5, 6, 7, 8 can be done in parallel), but Task 8 must follow all others since it wires them together.
