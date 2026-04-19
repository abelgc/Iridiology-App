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

### Client Journey (MVP)

```
1. Sign up / Login (public page)
2. Select report tier ($12 or $19.90)
3. Answer 9-question intake:
   - Name, email, main concern, symptom duration, medications
   - Date of birth, country of birth, city of birth, time of day
4. Pay (before analysis)
5. Upload iris images (2: right + left)
6. System analyzes, generates 11-section Spanish report
   → If all birth data + time provided: Calculate emotional field + chakra recommendation
7. View report (read-only)
8. Optional: Share report or request follow-up
```

### Practitioner Journey (Unchanged)

```
Existing: Patients → Sessions → Reports → Edit/Chat
NEW: Can see "Client Submissions" tab with completed client intake + report
     Can request deeper questionnaire (optional)
     Can refine report if needed
```

---

## Data Model Changes

### Core Principle
**No client accounts. Minimal data retention.** Client pays → provides intake → gets report → can re-download forever. Intake deleted 30 days after report unless client books practitioner (then it becomes part of their practitioner file).

### New Tables

```sql
-- Client analysis sessions (NO USER ACCOUNT NEEDED)
CREATE TABLE client_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Payment info
  payment_tier VARCHAR(20) NOT NULL CHECK (payment_tier IN ('basic_12', 'premium_19.90')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL,
  language VARCHAR(5) DEFAULT 'es' CHECK (language IN ('en', 'es')),
  
  -- Intake (temporary, deleted after 30 days unless client books)
  email TEXT NOT NULL, -- For report delivery only
  main_complaint TEXT,
  symptom_duration TEXT,
  current_medications TEXT,
  date_of_birth DATE,
  country_of_birth TEXT,
  city_of_birth TEXT,
  time_of_day VARCHAR(10) CHECK (time_of_day IN ('morning', 'evening')),
  
  -- Session link to practitioner data (if booked)
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  
  -- Report
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  report_download_token TEXT UNIQUE, -- One-time or permanent link token
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  report_delivered_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- No user_profiles or user accounts table needed for MVP
```

**Why this design:**
- ✅ No signup complexity
- ✅ GDPR compliant (no permanent client database)
- ✅ Reports accessible forever via email link (client owns it)
- ✅ If client books practitioner: their intake becomes part of practitioner workflow

### Schema Modifications

```sql
-- Sessions table: add source tracking + language
ALTER TABLE sessions ADD COLUMN created_by VARCHAR(20) DEFAULT 'practitioner' CHECK (created_by IN ('practitioner', 'client_self_service'));
ALTER TABLE sessions ADD COLUMN language VARCHAR(5) DEFAULT 'es' CHECK (language IN ('en', 'es'));

-- No RLS needed for client_analyses — data expires automatically
-- Practitioner sees own patients only (existing RLS works)
-- Client_analyses is audit-only (read by admin for analytics)
```

**Why minimal schema changes:**
- No user tracking required (stateless)
- No role separation needed (practitioner ≠ client by data separation alone)
- Language stored per analysis (not per user)
- Sessions table already exists; just add source + language

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

## Safety Checklist

- [ ] Images: Verified never written to disk
- [ ] User isolation: RLS policies scope all queries by role + user_id
- [ ] Payment: Only unpaid clients blocked from upload
- [ ] Session creation: `created_by_role='client'` always set for client submissions
- [ ] Report access: Client can only GET their own reports
- [ ] No accidental data leakage: Separate `/api/client/*` from `/api/*`

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
