---
name: Client App Architecture & Product Design
description: Dual-UI iridology platform with practitioner and client experiences sharing one backend
type: architecture
---

# Client App Design — Iridology Platform

## Executive Summary

Transform single-practitioner app into two experiences:
- **Practitioner UI** (`/(app)/*`): Existing workflows unchanged
- **Client UI** (`/client/*`): Guided linear intake → pay → upload images → receive 11-section report

**Shared backend:** Claude analysis engine (Sonnet primary, Haiku fallback), same database, RLS-enforced data separation.

**Languages:** Client chooses at entry (EN/ES flags), sets UI + report language. No login needed, preference stored per session.

---

## Language & Model Architecture

### Language Strategy

**No i18n framework.** Simple context + localStorage:

```typescript
// lib/i18n.ts
const translations = {
  en: { signup: 'Sign Up', mainConcern: 'Main Health Concern', ... },
  es: { signup: 'Crear Cuenta', mainConcern: 'Preocupación Principal', ... }
}

// Client chooses language at entry (2 flags: EN/ES)
// Stored in localStorage + URL param (?lang=en)
// All UI strings come from translations[lang]
// Reports generated in chosen language
```

**Implementation:**
- Add `useLanguage()` hook (wraps localStorage + context)
- All UI components use `t('key')` for strings
- Claude prompts accept `lang` parameter, adjust system prompt language
- Default: Browser locale detected (es-MX, es-ES, en-* → EN or ES)

### Model Selection

**Tier pricing strategy:**

| Tier | Model | Cost/Analysis | Quality | Speed |
|------|-------|---------------|---------|-------|
| Basic ($12) | Claude Haiku | $0.20 | Good | Fast (10s) |
| Premium ($19.90) | Claude Sonnet | $0.50 | Excellent | Medium (30s) |

**Decision logic:**
- Client selects payment tier → backend routes to correct model
- Haiku good enough for basic iridology (single image pair)
- Sonnet adds depth for premium clients (better emotional field, more nuance)
- Both support Jyotish enhancement if birth data complete

**Implementation:**
```typescript
// lib/ai/get-provider.ts (modify existing)
export async function getAIProvider(tier: 'basic' | 'premium') {
  if (tier === 'premium') return anthropic() // Sonnet
  return anthropic({ model: 'claude-3-5-haiku-20241022' }) // Haiku
}
```

---

## Product Flow

### Client Journey (MVP — Stateless, No Login)

```
1. Land on /client → choose language (EN/ES) + tier ($12 or $19.90)
2. Answer 9-question intake (name, email, concern, duration, meds, DOB, country, city, time of day)
3. Mock payment (Phase 1) / Real Stripe (Phase 2)
4. View tutorial → upload 2 iris images (right + left)
5. System analyzes (Haiku basic / Sonnet premium), generates 11-section report in chosen language
   → If birth data complete: Jyotish enhancement on emotional field
6. View report (read-only) at /client/report/[token]
7. Receive email with permanent download link
8. Optional: Print, request re-email, book practitioner (Phase 2)
```

### Practitioner Journey (MVP — Unchanged)

Existing flow preserved exactly. Practitioner sees nothing about client self-service in Phase 1.

Practitioner integration (viewing client submissions, refining reports, follow-up booking) deferred to Phase 2.

---

## Data Model Changes

### Core Principle
**No client accounts. Minimal data retention.** Client pays → provides intake → gets report → can re-download forever. Intake deleted 30 days after report unless client books practitioner (then it becomes part of their practitioner file).

### New Tables

**Decision: Decouple from sessions/patients tables.** Client analyses do NOT use the existing `patients` or `sessions` tables (those require `full_name NOT NULL` and `patient_id NOT NULL`). Client_analyses stores the report directly via foreign key to `reports`, but does NOT create patient records.

**Decision: Two-stage retention.** The row is kept forever (so report token works forever). Only PII fields are nulled after 30 days via cron.

```sql
-- Client analysis sessions (standalone, NOT linked to patients table)
CREATE TABLE client_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Payment info (paid_at nullable for MVP mock-payment mode)
  payment_tier VARCHAR(20) NOT NULL CHECK (payment_tier IN ('basic_12', 'premium_19_90')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMP WITH TIME ZONE, -- NULL in MVP mock mode
  is_mock_payment BOOLEAN DEFAULT FALSE, -- TRUE in dev/testing
  
  language VARCHAR(2) NOT NULL DEFAULT 'es' CHECK (language IN ('en', 'es')),
  
  -- Intake fields (PII — nulled after pii_expires_at)
  email TEXT, -- nullable so cron can clear after 30d
  main_complaint TEXT,
  symptom_duration TEXT,
  current_medications TEXT,
  date_of_birth DATE,
  country_of_birth TEXT,
  city_of_birth TEXT,
  time_of_day VARCHAR(10) CHECK (time_of_day IN ('morning', 'evening')),
  
  -- Report (PERMANENT — never deleted, this is what client paid for)
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  report_download_token TEXT UNIQUE NOT NULL, -- Generated at row creation, UUID v4
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'intake_pending' 
    CHECK (status IN ('intake_pending', 'paid', 'analyzing', 'completed', 'failed')),
  failure_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  report_delivered_at TIMESTAMP WITH TIME ZONE,
  pii_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_client_analyses_token ON client_analyses(report_download_token);
CREATE INDEX idx_client_analyses_status ON client_analyses(status);
CREATE INDEX idx_client_analyses_pii_expires ON client_analyses(pii_expires_at) WHERE email IS NOT NULL;

-- Reports table modification: make session_id nullable (client analyses don't have sessions)
ALTER TABLE reports ALTER COLUMN session_id DROP NOT NULL;

-- RLS: client_analyses is server-only (admin/service-role access only)
ALTER TABLE client_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only"
  ON client_analyses FOR ALL
  USING (false); -- No client/anon access; all access via API routes using service role

-- Reports table: existing RLS allows authenticated users (practitioner) to read all reports
-- Client report access happens via API route using token, not direct DB access
```

**Cleanup mechanism:** Use Supabase pg_cron extension to NULL PII fields nightly:

```sql
-- Schedule nightly cleanup
SELECT cron.schedule(
  'clear-client-pii',
  '0 3 * * *', -- 3 AM daily
  $$
    UPDATE client_analyses
    SET email = NULL,
        main_complaint = NULL,
        symptom_duration = NULL,
        current_medications = NULL,
        date_of_birth = NULL,
        country_of_birth = NULL,
        city_of_birth = NULL,
        time_of_day = NULL
    WHERE pii_expires_at < NOW()
      AND email IS NOT NULL;
  $$
);
```

**Why this design:**
- ✅ No signup complexity (stateless, no auth)
- ✅ GDPR compliant (PII cleared after 30 days, only report content retained)
- ✅ Reports accessible forever via download token (client owns deliverable)
- ✅ Existing `patients`/`sessions` tables untouched (zero practitioner disruption)
- ✅ `reports` table reused (1 minor change: session_id nullable)

---

## File Structure

```
/app
  /client/                         # NEW: Client self-service flow
    page.tsx                       # Entry: 2 language flags (EN/ES) + tier selection
    /intake
      page.tsx                     # 9-question form (translated)
      /payment
        page.tsx                   # Stripe payment (translated)
        /success
          page.tsx                 # Post-payment redirect
    /upload
      page.tsx                     # Image upload (2 images)
    /report
      /[token]
        page.tsx                   # Report view via download token (no login)
        /download
          route.ts                 # Email report / download link
  /(app)/                          # EXISTING: Practitioner routes
    /patients/*
    /sessions/*
    /reports/*
    ...                            # Unchanged

  /api
    /client/                       # NEW: Client APIs (stateless)
      /intake
        route.ts                   # POST intake → return token
      /payment
        route.ts                   # POST payment details → Stripe charge
      /upload
        route.ts                   # POST iris images + token → Claude analysis
      /reports
        /[token]
          route.ts                 # GET report by token (no auth)
          /email
            route.ts               # POST resend report email
    /                              # EXISTING: Practitioner APIs
      /patients/*
      /sessions/*
      /reports/*
      ...                          # Unchanged

  /lib
    /i18n.ts                       # NEW: Language context + translations (en/es)
    /client/
      /payment.ts                  # Stripe API calls
      /report-token.ts             # Token generation + validation
    /claude/
      /enhance-emotional-field.ts  # REUSE (tier-aware: Sonnet adds more detail)
      /analyze.ts                  # MODIFY: Accept model tier parameter
      /prompts.ts                  # MODIFY: Add language parameter to all prompts
```

---

## Key Design Decisions

| Decision | Rule | Why |
|----------|------|-----|
| **No user accounts** | Stateless: pay → intake → report → email | No signup friction, GDPR safe, simpler code |
| **No image storage** | Images never written to disk/Supabase Storage | Privacy, compliance, cost |
| **Token-based access** | Report URL: `/report/[UUID]?token=xxx` | Client owns report forever, can share link |
| **Tiered models** | Haiku (basic/$12) / Sonnet (premium/$19.90) | Cost matches quality expectation |
| **Bilingual UI** | EN/ES flags at entry, language per analysis | EU + Mexico markets, stored in client_analyses |
| **Separate client routes** | `/client/*` isolated from `/(app)/*` | Zero disruption to practitioner flow |
| **Reuse Claude analysis** | Same 11-section prompt, language-parameterized | No code duplication, just translate prompts |
| **Jyotish as enhancement** | Optional if birth data complete | Both models support it (tier doesn't limit features) |
| **Minimal data retention** | Delete intake after 30 days (unless practitioner booking) | GDPR compliance, reduces liability |
| **Payment upfront** | Charge → then intake/upload | No non-paying analyses |

---

## Data Flow: Client Self-Service Analysis

```
1. Client arrives at /client
   ├─ Choose language (EN or ES, detected from browser)
   ├─ Choose tier ($12 basic or $19.90 premium)
   └─ Create temporary session token (stored in localStorage)

2. Client POST /api/client/intake
   ├─ Send: 9 questions + tier + language
   ├─ Validate and store in client_analyses table
   ├─ Return: intake_token (unique, stateless)
   └─ Redirect to /client/intake/payment

3. Client POST /api/client/payment
   ├─ Stripe charge ($12 or $19.90)
   ├─ Update client_analyses: paid_at = NOW()
   ├─ Generate report_download_token
   └─ Redirect to /client/upload

4. Client POST /api/client/upload
   ├─ Receive: 2 base64 images + intake_token
   ├─ Load intake data from client_analyses
   ├─ Choose model: Haiku (basic) or Sonnet (premium)
   ├─ Build Claude context:
   │   - Images (base64)
   │   - Intake responses (name, concern, meds, etc.)
   │   - Language param (es or en)
   │   - Jyotish data if complete
   ├─ Call lib/claude/analyze(images, context, tier, language)
   ├─ Claude returns 11-section report (in chosen language)
   ├─ If Jyotish eligible: enhanceEmotionalFieldWithJyotish()
   ├─ Store report in reports table
   ├─ Create session record: created_by='client_self_service'
   ├─ Delete images from memory (never stored)
   ├─ Update client_analyses: report_id, report_delivered_at
   ├─ Send email: report download link
   └─ Return: report_download_token

5. Client GET /api/client/reports/[token]
   ├─ Validate token (must match client_analyses.report_download_token)
   ├─ Load report from DB
   └─ Return JSON (sections 1-11, in stored language)

6. Client GET /app/client/report/[token]
   ├─ Render 11 sections (read-only)
   ├─ Show buttons: Download PDF, Email to me, Print
   └─ Optional: "Book practitioner follow-up"

7. Client email delivery (automatic)
   ├─ Subject: "Your Iridology Analysis Report" (translated)
   ├─ Body: Download link + report preview
   ├─ Link valid: forever (client owns report)
   └─ Can request re-email via /api/client/reports/[token]/email
```

---

## Jyotish Enhancement (Nice-to-Have Premium)

**When triggered:** All 9 intake fields filled + valid date/location/time

**Data required:**
- `date_of_birth` (date)
- `country_of_birth` (text)
- `city_of_birth` (text)
- `time_of_day` ('morning' | 'evening')

**Result:** 
- Chakra recommendation + primary emotion to work on
- Integrated into section_2_emotional_field (blended with iridology findings)
- Practitioner sees full enhanced report

**Reuse:** `lib/claude/enhance-emotional-field.ts` (already exists)

---

## Practitioner Integration (Phase 2)

**Future:** Practitioner can optionally review client self-service submissions

**MVP (Phase 1):** Not in scope. Client reports are standalone, not visible in practitioner UI yet.

**Phase 2 scope:**
- Practitioner dashboard shows: "Client Self-Service Submissions" tab
- Can filter by date, tier, language
- Can view intake + report
- Can add notes
- Can request client to book follow-up appointment
- Can optionally send deeper questionnaire (Tally link)

**Why Phase 2?**
- MVP validates that self-service works
- Practitioner integration adds complexity
- Phase 1 focuses on: client flow, payment, Claude quality

---

## Resolved Architectural Decisions (Final)

| Topic | Decision |
|-------|----------|
| **Email provider** | Resend (Next.js-friendly, simple API, generous free tier) |
| **PDF generation** | Browser print-to-PDF using existing print styles (no new dep for MVP) |
| **PII cleanup** | Supabase pg_cron nightly job nulls PII fields after 30 days |
| **Image validation** | Max 10MB each, JPEG/PNG only, exactly 2 images, min 800×800px |
| **Tutorial** | Embedded video link from existing partner Google Form on upload page |
| **Token format** | UUID v4 (122 bits entropy, non-enumerable, URL-safe) |
| **Auth middleware** | Add `/client/*` and `/api/client/*` to public exclusion list |
| **Currency** | EUR default; tier names use underscores (`basic_12`, `premium_19_90`) for SQL safety |
| **Locale detection** | `es-*` → `es`, `en-*` → `en`, anything else → `en`; client can override with flag |
| **Status tracking** | Add `status` enum to `client_analyses` for failure recovery / retry |
| **Practitioner integration** | Phase 2 only — MVP keeps client/practitioner UIs fully isolated |
| **Mock payment** | MVP-only flag `is_mock_payment=TRUE`; production must reject mock requests |

## Safety Checklist

- [ ] Images verified never written to disk or Supabase Storage
- [ ] `client_analyses` RLS denies all anon/auth access (service role only via API)
- [ ] Auth middleware excludes `/client/*` and `/api/client/*` from login redirect
- [ ] Mock payment endpoint disabled when `NODE_ENV=production`
- [ ] Image validation enforces size/format/count limits BEFORE Claude call
- [ ] Report download token uses UUID v4 (cryptographically random)
- [ ] PII cleanup cron verified running and tested
- [ ] Practitioner routes/APIs unchanged (regression test on patient flow)
- [ ] Email delivery failures logged but do not block report generation
- [ ] Sessions table `created_by` field never set to `client_self_service` in MVP (we don't use sessions for client analyses)

---

## Implementation Priorities (MVP → Phase 2)

**Phase 1 (MVP - 2-3 weeks):**
- ✅ Language flags (EN/ES) at entry, stored per analysis
- ✅ Bilingual intake form (9 questions translated)
- ✅ Model tier selection + Sonnet/Haiku routing
- ✅ No payment (skip Stripe for now, mock payment in dev)
- ✅ Client analysis flow (images → Claude → report)
- ✅ Jyotish enhancement (both tiers support it)
- ✅ Report delivery: Email + download link
- ✅ Practitioner sees nothing yet (separate from existing UI)

**Phase 2 (Payment + Integration):**
- Stripe integration (already decided: charge before upload)
- Practitioner dashboard: "Self-Service Submissions" tab
- Client can book practitioner follow-up
- Analytics: conversion funnel, tier breakdown

**Defer (Phase 3+):**
- Deeper questionnaire (Tally link, optional)
- Multi-language options beyond EN/ES
- Advanced analytics (cohort analysis, ROI tracking)
