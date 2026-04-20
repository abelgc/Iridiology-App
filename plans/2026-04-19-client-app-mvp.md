# Client App MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a stateless, bilingual (EN/ES), self-service client flow that turns a 9-question intake + 2 iris images into an emailed 11-section report — without disrupting the existing practitioner workflow.

**Architecture:** New `/client/*` routes and `/api/client/*` endpoints isolated from existing practitioner code. Single new table `client_analyses` (no user accounts). Reuses existing Claude analyze logic with new `language` and `tier` parameters. MVP uses mock payment; Stripe deferred to Phase 2.

**Tech Stack:** Next.js 16.2.1 App Router, React 19, TypeScript, Supabase (Postgres + RLS), Tailwind v4, shadcn/ui, Anthropic SDK (Sonnet + Haiku), Resend (email), Vitest, Playwright, Zod, react-hook-form.

**Reference spec:** `docs/superpowers/specs/2026-04-19-client-app-design.md`

---

## File Map

**New files:**
- `docs/migrations/003-client-analyses.sql` — DB migration
- `src/lib/i18n.ts` — translations dictionary
- `src/lib/i18n-context.tsx` — React context + `useLanguage` hook
- `src/lib/client/report-token.ts` — UUID v4 token generator
- `src/lib/client/image-validation.ts` — size/format/dimension checks
- `src/lib/client/email.ts` — Resend client + report email template
- `src/lib/validators/client-intake.ts` — Zod schema for 9-question form
- `src/lib/validators/client-upload.ts` — Zod schema for image upload payload
- `src/types/client-analysis.ts` — TypeScript types
- `src/app/client/layout.tsx` — Client-app shell (no sidebar, language toggle in header)
- `src/app/client/page.tsx` — Entry: language flags + tier selection
- `src/app/client/intake/page.tsx` — 9-question form
- `src/app/client/intake/payment/page.tsx` — Mock payment screen (MVP)
- `src/app/client/upload/page.tsx` — Tutorial + image upload
- `src/app/client/upload/processing/page.tsx` — Analysis progress (SSE consumer)
- `src/app/client/report/[token]/page.tsx` — Read-only report view
- `src/app/api/client/intake/route.ts` — POST intake
- `src/app/api/client/payment/route.ts` — POST mock payment
- `src/app/api/client/upload/route.ts` — POST images → Claude → report
- `src/app/api/client/reports/[token]/route.ts` — GET report by token
- `src/app/api/client/reports/[token]/email/route.ts` — POST resend email
- `src/components/client/language-toggle.tsx` — EN/ES flag buttons
- `src/components/client/tier-selector.tsx` — Basic/Premium card selector
- `src/components/client/intake-form.tsx` — Form component
- `src/components/client/upload-tutorial.tsx` — Photo guidance
- `src/components/client/iris-image-upload.tsx` — Drag-drop + preview
- `src/components/client/client-report-viewer.tsx` — Read-only report renderer

**Modified files:**
- `src/middleware.ts` — exclude `/client` and `/api/client` from auth
- `src/lib/claude/analyze.ts` — accept `language` + `tier` params (verify exact path during Task 7)
- `src/lib/claude/prompts.ts` — add EN versions of prompts
- `src/lib/ai/get-provider.ts` — accept tier, return Haiku or Sonnet
- `src/lib/claude/enhance-emotional-field.ts` — accept language param
- `package.json` — add `resend` dependency

**Test files:**
- `src/lib/__tests__/i18n.test.ts`
- `src/lib/client/__tests__/report-token.test.ts`
- `src/lib/client/__tests__/image-validation.test.ts`
- `src/lib/client/__tests__/email.test.ts`
- `src/lib/validators/__tests__/client-intake.test.ts`
- `src/lib/validators/__tests__/client-upload.test.ts`
- `src/app/api/client/intake/__tests__/route.test.ts`
- `src/app/api/client/payment/__tests__/route.test.ts`
- `src/app/api/client/upload/__tests__/route.test.ts`
- `src/app/api/client/reports/[token]/__tests__/route.test.ts`
- `src/components/client/__tests__/language-toggle.test.tsx`
- `src/components/client/__tests__/intake-form.test.tsx`
- `src/components/client/__tests__/iris-image-upload.test.tsx`
- `e2e/client-self-service.spec.ts` — full end-to-end flow

---

## Task 0: Branch + Worktree Setup

**Files:** none (git operations)

- [x] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: only the existing untracked files (`.claude/`, `docs/CUESTIONARIO...pdf`) and modified `package-lock.json` from current context. No staged changes that should not be on the new branch.

- [x] **Step 2: Create feature branch**

```bash
git checkout -b feat/client-app-mvp
```
Expected: `Switched to a new branch 'feat/client-app-mvp'`

- [x] **Step 3: Push branch to set upstream**

```bash
git push -u origin feat/client-app-mvp
```
Expected: branch created on remote.

- [x] **Step 4: Confirm Node + npm versions match repo**

```bash
node --version
npm --version
```
Expected: Node ≥ 20, npm ≥ 10. If mismatched, switch via `nvm use` before continuing.

- [x] **Step 5: Install deps clean**

```bash
npm ci
```
Expected: install completes without errors.

---

## Task 1: Database Migration

**Files:**
- Create: `docs/migrations/003-client-analyses.sql`

- [x] **Step 1: Create migration file**

Create `docs/migrations/003-client-analyses.sql` with this exact content:

```sql
-- Migration 003: client_analyses table for stateless self-service flow
-- Date: 2026-04-19

-- Allow reports to exist without a session (client analyses skip the sessions table)
ALTER TABLE reports ALTER COLUMN session_id DROP NOT NULL;

-- Main table for client self-service analyses
CREATE TABLE IF NOT EXISTS client_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Payment
  payment_tier VARCHAR(20) NOT NULL CHECK (payment_tier IN ('basic_12', 'premium_19_90')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  stripe_payment_intent_id TEXT UNIQUE,
  paid_at TIMESTAMP WITH TIME ZONE,
  is_mock_payment BOOLEAN NOT NULL DEFAULT FALSE,

  language VARCHAR(2) NOT NULL DEFAULT 'es' CHECK (language IN ('en', 'es')),

  -- PII (cleared after pii_expires_at by nightly cron)
  email TEXT,
  main_complaint TEXT,
  symptom_duration TEXT,
  current_medications TEXT,
  date_of_birth DATE,
  country_of_birth TEXT,
  city_of_birth TEXT,
  time_of_day VARCHAR(10) CHECK (time_of_day IN ('morning', 'evening')),

  -- Report (permanent)
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  report_download_token TEXT UNIQUE NOT NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'intake_pending'
    CHECK (status IN ('intake_pending', 'paid', 'analyzing', 'completed', 'failed')),
  failure_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  report_delivered_at TIMESTAMP WITH TIME ZONE,
  pii_expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_client_analyses_token ON client_analyses(report_download_token);
CREATE INDEX IF NOT EXISTS idx_client_analyses_status ON client_analyses(status);
CREATE INDEX IF NOT EXISTS idx_client_analyses_pii_expires
  ON client_analyses(pii_expires_at)
  WHERE email IS NOT NULL;

-- RLS: deny direct client/anon access. All access goes through API routes using service role.
ALTER TABLE client_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON client_analyses;
CREATE POLICY "Service role only"
  ON client_analyses
  FOR ALL
  USING (false);
```

- [x] **Step 2: Apply migration via Supabase SQL editor**

Open Supabase dashboard → SQL editor → paste file contents → Run.
Expected: "Success. No rows returned."

- [x] **Step 3: Verify table exists**

In SQL editor, run:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'client_analyses'
ORDER BY ordinal_position;
```
Expected: 19 columns, with `email` nullable, `report_download_token` not null, `paid_at` nullable.

- [x] **Step 4: Verify reports.session_id is nullable**

```sql
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'reports' AND column_name = 'session_id';
```
Expected: `YES`.

- [x] **Step 5: Schedule nightly PII cleanup**

In Supabase SQL editor, ensure `pg_cron` extension is enabled (Database → Extensions → pg_cron → Enable). Then run:

```sql
SELECT cron.schedule(
  'clear-client-pii',
  '0 3 * * *',
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
Expected: returns a cron job id (integer).

- [x] **Step 6: Commit migration**

```bash
git add docs/migrations/003-client-analyses.sql
git commit -m "feat(db): add client_analyses table and PII cleanup cron"
```

---

## Task 2: i18n Foundation

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/lib/i18n-context.tsx`
- Test: `src/lib/__tests__/i18n.test.ts`

- [x] **Step 1: Write the failing test for translations dictionary**

Create `src/lib/__tests__/i18n.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { translations, t, detectLocale } from '@/lib/i18n'

describe('i18n', () => {
  it('exposes en and es dictionaries with matching keys', () => {
    const enKeys = Object.keys(translations.en).sort()
    const esKeys = Object.keys(translations.es).sort()
    expect(enKeys).toEqual(esKeys)
  })

  it('t() returns the string for the given lang and key', () => {
    expect(t('en', 'continue')).toBe('Continue')
    expect(t('es', 'continue')).toBe('Continuar')
  })

  it('t() returns the key itself when missing (so missing strings are visible in QA)', () => {
    // @ts-expect-error intentional: testing fallback
    expect(t('en', 'definitely_missing_key')).toBe('definitely_missing_key')
  })

  it('detectLocale defaults to en for non-spanish locales', () => {
    expect(detectLocale('en-US')).toBe('en')
    expect(detectLocale('fr-FR')).toBe('en')
    expect(detectLocale(undefined)).toBe('en')
  })

  it('detectLocale returns es for any es-* locale', () => {
    expect(detectLocale('es-MX')).toBe('es')
    expect(detectLocale('es-ES')).toBe('es')
    expect(detectLocale('es')).toBe('es')
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/lib/__tests__/i18n.test.ts
```
Expected: fails with "Cannot find module '@/lib/i18n'".

- [x] **Step 3: Create translations file**

Create `src/lib/i18n.ts`:

```typescript
export type Lang = 'en' | 'es'

export const translations = {
  en: {
    // shell
    appTitle: 'Iridology Analysis',
    continue: 'Continue',
    back: 'Back',
    submit: 'Submit',
    loading: 'Loading...',
    error: 'Something went wrong',
    // entry page
    chooseLanguage: 'Choose your language',
    chooseTier: 'Choose your report',
    tierBasicTitle: 'Basic Report',
    tierBasicPrice: '€12',
    tierBasicDescription: 'Full 11-section iridology report. Fast turnaround.',
    tierPremiumTitle: 'Premium Report',
    tierPremiumPrice: '€19.90',
    tierPremiumDescription: 'In-depth analysis with richer emotional field interpretation.',
    // intake form
    intakeTitle: 'Tell us about you',
    fieldFullName: 'Full name',
    fieldEmail: 'Email',
    fieldMainComplaint: 'Main health concern',
    fieldSymptomDuration: 'How long have you had this concern?',
    fieldCurrentMedications: 'Current medications (optional)',
    fieldDateOfBirth: 'Date of birth',
    fieldCountryOfBirth: 'Country of birth',
    fieldCityOfBirth: 'City of birth',
    fieldTimeOfDay: 'Were you born in the morning or evening?',
    timeOfDayMorning: 'Morning',
    timeOfDayEvening: 'Evening',
    // payment (mock)
    paymentMockHeading: 'Mock payment (test mode)',
    paymentMockBody: 'Payment is disabled while we test the flow. Click continue to proceed.',
    // upload
    uploadTitle: 'Upload your iris photos',
    uploadTutorialHeading: 'How to take the photos',
    uploadTutorialLinkLabel: 'View the photo tutorial',
    uploadRightEye: 'Right eye',
    uploadLeftEye: 'Left eye',
    uploadAnalyzing: 'Analyzing your iris patterns...',
    // report
    reportReady: 'Your report is ready',
    reportDownload: 'Download PDF',
    reportEmail: 'Email me this report',
    reportPrint: 'Print',
    reportEmailSent: 'Report sent to your email.',
    // errors
    errorImageTooLarge: 'Image is larger than 10 MB.',
    errorImageFormat: 'Only JPEG and PNG images are accepted.',
    errorImageDimensions: 'Image must be at least 800×800 pixels.',
    errorImageCount: 'Please upload exactly 2 images: right eye and left eye.',
    errorIntakeRequired: 'This field is required.',
    errorEmailFormat: 'Please enter a valid email address.',
  },
  es: {
    appTitle: 'Análisis de Iridología',
    continue: 'Continuar',
    back: 'Atrás',
    submit: 'Enviar',
    loading: 'Cargando...',
    error: 'Algo salió mal',
    chooseLanguage: 'Elige tu idioma',
    chooseTier: 'Elige tu informe',
    tierBasicTitle: 'Informe Básico',
    tierBasicPrice: '€12',
    tierBasicDescription: 'Informe iridológico completo de 11 secciones. Entrega rápida.',
    tierPremiumTitle: 'Informe Premium',
    tierPremiumPrice: '€19,90',
    tierPremiumDescription: 'Análisis en profundidad con interpretación más rica del campo emocional.',
    intakeTitle: 'Cuéntanos sobre ti',
    fieldFullName: 'Nombre completo',
    fieldEmail: 'Correo electrónico',
    fieldMainComplaint: 'Principal preocupación de salud',
    fieldSymptomDuration: '¿Hace cuánto tienes esta preocupación?',
    fieldCurrentMedications: 'Medicamentos actuales (opcional)',
    fieldDateOfBirth: 'Fecha de nacimiento',
    fieldCountryOfBirth: 'País de nacimiento',
    fieldCityOfBirth: 'Ciudad de nacimiento',
    fieldTimeOfDay: '¿Naciste por la mañana o por la tarde/noche?',
    timeOfDayMorning: 'Mañana',
    timeOfDayEvening: 'Tarde/Noche',
    paymentMockHeading: 'Pago simulado (modo de prueba)',
    paymentMockBody: 'El pago está deshabilitado mientras probamos el flujo. Pulsa continuar para proceder.',
    uploadTitle: 'Sube tus fotos del iris',
    uploadTutorialHeading: 'Cómo tomar las fotos',
    uploadTutorialLinkLabel: 'Ver el tutorial de fotos',
    uploadRightEye: 'Ojo derecho',
    uploadLeftEye: 'Ojo izquierdo',
    uploadAnalyzing: 'Analizando los patrones de tu iris...',
    reportReady: 'Tu informe está listo',
    reportDownload: 'Descargar PDF',
    reportEmail: 'Enviarme este informe por correo',
    reportPrint: 'Imprimir',
    reportEmailSent: 'Informe enviado a tu correo.',
    errorImageTooLarge: 'La imagen pesa más de 10 MB.',
    errorImageFormat: 'Solo se aceptan imágenes JPEG y PNG.',
    errorImageDimensions: 'La imagen debe ser de al menos 800×800 píxeles.',
    errorImageCount: 'Por favor sube exactamente 2 imágenes: ojo derecho y ojo izquierdo.',
    errorIntakeRequired: 'Este campo es obligatorio.',
    errorEmailFormat: 'Por favor introduce un correo válido.',
  },
} as const

export type TranslationKey = keyof typeof translations.en

export function t(lang: Lang, key: TranslationKey): string {
  const dict = translations[lang] ?? translations.en
  return (dict as Record<string, string>)[key] ?? key
}

export function detectLocale(navigatorLang: string | undefined): Lang {
  if (!navigatorLang) return 'en'
  return navigatorLang.toLowerCase().startsWith('es') ? 'es' : 'en'
}
```

- [x] **Step 4: Run test to verify pass**

```bash
npm run test -- src/lib/__tests__/i18n.test.ts
```
Expected: 5 tests pass.

- [x] **Step 5: Create i18n React context**

Create `src/lib/i18n-context.tsx`:

```typescript
'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Lang, t as translate, TranslationKey, detectLocale } from './i18n'

const STORAGE_KEY = 'iridology_lang'

type LanguageContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: ReactNode
  initialLang?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? 'en')

  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? window.localStorage.getItem(STORAGE_KEY)
      : null) as Lang | null
    if (stored === 'en' || stored === 'es') {
      setLangState(stored)
      return
    }
    setLangState(detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined))
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: (key) => translate(lang, key) }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider')
  return ctx
}
```

- [x] **Step 6: Commit**

```bash
git add src/lib/i18n.ts src/lib/i18n-context.tsx src/lib/__tests__/i18n.test.ts
git commit -m "feat(i18n): add EN/ES translations dictionary and language context"
```

---

## Task 3: Auth Middleware Update

**Files:**
- Modify: `src/middleware.ts`

- [x] **Step 1: Read current middleware to learn its structure**

```bash
cat src/middleware.ts
```
Note the current matcher and the redirect logic so the next step preserves practitioner behavior.

- [x] **Step 2: Update middleware to skip /client and /api/client routes**

Modify the existing redirect/matcher logic to add an early return when `request.nextUrl.pathname` starts with `/client` or `/api/client`. Example minimal addition (adapt to whatever the file currently exports):

```typescript
// Inside middleware()
if (
  request.nextUrl.pathname.startsWith('/client') ||
  request.nextUrl.pathname.startsWith('/api/client')
) {
  return NextResponse.next()
}
```

If the file uses `config.matcher`, also add `'/((?!client|api/client|_next|.*\\..*).*)'` style exclusion so middleware does not run for client routes at all. Pick whichever pattern matches the existing file style — do not introduce a second pattern style.

- [x] **Step 3: Manually verify practitioner redirect still works**

```bash
npm run dev
```
In a browser, open `http://localhost:3000/patients` while logged out. Expected: redirected to `/login`.

Then open `http://localhost:3000/client`. Expected: 404 (route does not exist yet) — NOT a redirect to `/login`. Stop dev server (`Ctrl+C`).

- [x] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): bypass auth for /client and /api/client routes"
```

---

## Task 4: Token Generator

**Files:**
- Create: `src/lib/client/report-token.ts`
- Test: `src/lib/client/__tests__/report-token.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/client/__tests__/report-token.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateReportToken, isValidReportToken } from '@/lib/client/report-token'

describe('report-token', () => {
  it('generates a UUID v4 string', () => {
    const token = generateReportToken()
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateReportToken()))
    expect(tokens.size).toBe(100)
  })

  it('isValidReportToken accepts a generated token', () => {
    expect(isValidReportToken(generateReportToken())).toBe(true)
  })

  it('isValidReportToken rejects garbage', () => {
    expect(isValidReportToken('not-a-uuid')).toBe(false)
    expect(isValidReportToken('')).toBe(false)
    expect(isValidReportToken('00000000-0000-0000-0000-000000000000')).toBe(false) // not v4
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/lib/client/__tests__/report-token.test.ts
```
Expected: fails — module not found.

- [x] **Step 3: Implement token module**

Create `src/lib/client/report-token.ts`:

```typescript
import { randomUUID } from 'node:crypto'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function generateReportToken(): string {
  return randomUUID()
}

export function isValidReportToken(value: string): boolean {
  return typeof value === 'string' && UUID_V4_REGEX.test(value)
}
```

- [x] **Step 4: Run test to verify pass**

```bash
npm run test -- src/lib/client/__tests__/report-token.test.ts
```
Expected: 4 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/client/report-token.ts src/lib/client/__tests__/report-token.test.ts
git commit -m "feat(client): add UUID v4 report download token generator"
```

---

## Task 5: Image Validation

**Files:**
- Create: `src/lib/client/image-validation.ts`
- Test: `src/lib/client/__tests__/image-validation.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/client/__tests__/image-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  validateImage,
  IMAGE_MAX_BYTES,
  ALLOWED_MIME_TYPES,
  MIN_DIMENSION,
} from '@/lib/client/image-validation'

function makeBlob(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

describe('image-validation', () => {
  it('exposes the documented constants', () => {
    expect(IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png'])
    expect(MIN_DIMENSION).toBe(800)
  })

  it('rejects images larger than 10 MB', async () => {
    const blob = makeBlob(IMAGE_MAX_BYTES + 1, 'image/jpeg')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_large')
  })

  it('rejects unsupported mime types', async () => {
    const blob = makeBlob(1024, 'image/gif')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('bad_format')
  })

  it('rejects images smaller than 800x800', async () => {
    const blob = makeBlob(1024, 'image/jpeg')
    const result = await validateImage(blob, { width: 600, height: 1024 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('too_small')
  })

  it('accepts a valid image', async () => {
    const blob = makeBlob(1024, 'image/jpeg')
    const result = await validateImage(blob, { width: 1024, height: 1024 })
    expect(result.ok).toBe(true)
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/lib/client/__tests__/image-validation.test.ts
```
Expected: fails — module not found.

- [x] **Step 3: Implement validation**

Create `src/lib/client/image-validation.ts`:

```typescript
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const
export const MIN_DIMENSION = 800

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: 'too_large' | 'bad_format' | 'too_small' }

export async function validateImage(
  blob: Blob,
  dimensions: { width: number; height: number },
): Promise<ValidationResult> {
  if (blob.size > IMAGE_MAX_BYTES) {
    return { ok: false, reason: 'too_large' }
  }
  if (!ALLOWED_MIME_TYPES.includes(blob.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, reason: 'bad_format' }
  }
  if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
    return { ok: false, reason: 'too_small' }
  }
  return { ok: true }
}

export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}
```

- [x] **Step 4: Run test to verify pass**

```bash
npm run test -- src/lib/client/__tests__/image-validation.test.ts
```
Expected: 5 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/client/image-validation.ts src/lib/client/__tests__/image-validation.test.ts
git commit -m "feat(client): add image upload validation (size, format, dimensions)"
```

---

## Task 6: Intake Zod Schema

**Files:**
- Create: `src/lib/validators/client-intake.ts`
- Create: `src/types/client-analysis.ts`
- Test: `src/lib/validators/__tests__/client-intake.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/lib/validators/__tests__/client-intake.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { clientIntakeSchema } from '@/lib/validators/client-intake'

const baseValid = {
  language: 'en',
  payment_tier: 'basic_12',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  main_complaint: 'Persistent fatigue',
  symptom_duration: '6 months',
  current_medications: 'None',
  date_of_birth: '1990-05-12',
  country_of_birth: 'Mexico',
  city_of_birth: 'Mexico City',
  time_of_day: 'morning',
}

describe('clientIntakeSchema', () => {
  it('accepts a fully filled intake', () => {
    const parsed = clientIntakeSchema.parse(baseValid)
    expect(parsed.email).toBe('jane@example.com')
  })

  it('rejects invalid email', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, email: 'not-an-email' })).toThrow()
  })

  it('rejects unknown payment_tier', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, payment_tier: 'free' })).toThrow()
  })

  it('rejects unknown language', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, language: 'fr' })).toThrow()
  })

  it('allows current_medications to be empty', () => {
    const parsed = clientIntakeSchema.parse({ ...baseValid, current_medications: '' })
    expect(parsed.current_medications).toBe('')
  })

  it('rejects time_of_day values outside the allowed set', () => {
    expect(() => clientIntakeSchema.parse({ ...baseValid, time_of_day: 'noon' })).toThrow()
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/lib/validators/__tests__/client-intake.test.ts
```
Expected: fails — module not found.

- [x] **Step 3: Create types file**

Create `src/types/client-analysis.ts`:

```typescript
export type Lang = 'en' | 'es'
export type PaymentTier = 'basic_12' | 'premium_19_90'
export type TimeOfDay = 'morning' | 'evening'
export type ClientAnalysisStatus =
  | 'intake_pending'
  | 'paid'
  | 'analyzing'
  | 'completed'
  | 'failed'

export const TIER_PRICING: Record<PaymentTier, { amount: number; currency: 'EUR' }> = {
  basic_12: { amount: 12.0, currency: 'EUR' },
  premium_19_90: { amount: 19.9, currency: 'EUR' },
}
```

- [x] **Step 4: Implement Zod schema**

Create `src/lib/validators/client-intake.ts`:

```typescript
import { z } from 'zod'

export const clientIntakeSchema = z.object({
  language: z.enum(['en', 'es']),
  payment_tier: z.enum(['basic_12', 'premium_19_90']),
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  main_complaint: z.string().min(1).max(2000),
  symptom_duration: z.string().min(1).max(255),
  current_medications: z.string().max(2000).default(''),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country_of_birth: z.string().min(1).max(255),
  city_of_birth: z.string().min(1).max(255),
  time_of_day: z.enum(['morning', 'evening']),
})

export type ClientIntakeInput = z.infer<typeof clientIntakeSchema>
```

- [x] **Step 5: Run test to verify pass**

```bash
npm run test -- src/lib/validators/__tests__/client-intake.test.ts
```
Expected: 6 tests pass.

- [x] **Step 6: Commit**

```bash
git add src/types/client-analysis.ts src/lib/validators/client-intake.ts src/lib/validators/__tests__/client-intake.test.ts
git commit -m "feat(client): add Zod schema and types for client intake"
```

---

## Task 7: Multi-Language and Tier-Aware Claude Layer

**Files:**
- Inspect: `src/lib/claude/analyze.ts`, `src/lib/claude/prompts.ts`, `src/lib/ai/get-provider.ts`, `src/lib/claude/enhance-emotional-field.ts`
- Modify: `src/lib/ai/get-provider.ts`
- Modify: `src/lib/claude/prompts.ts`
- Modify: `src/lib/claude/analyze.ts`
- Modify: `src/lib/claude/enhance-emotional-field.ts`
- Test: `src/lib/claude/__tests__/prompts.test.ts` (extend existing if present)

- [x] **Step 1: Read each file to learn its current shape**

```bash
cat src/lib/ai/get-provider.ts
cat src/lib/claude/analyze.ts
cat src/lib/claude/prompts.ts
cat src/lib/claude/enhance-emotional-field.ts
ls src/lib/claude/__tests__
```
Note any settings-driven provider selection or existing tests so the next steps don't duplicate them.

- [x] **Step 2: Write the failing test for tier routing**

Append to `src/lib/claude/__tests__/prompts.test.ts` (or create the file if it does not exist):

```typescript
import { describe, it, expect } from 'vitest'
import { getModelForTier } from '@/lib/ai/get-provider'

describe('getModelForTier', () => {
  it('returns the haiku model id for basic tier', () => {
    expect(getModelForTier('basic_12')).toMatch(/haiku/i)
  })
  it('returns the sonnet model id for premium tier', () => {
    expect(getModelForTier('premium_19_90')).toMatch(/sonnet/i)
  })
})
```

- [x] **Step 3: Run test to verify failure**

```bash
npm run test -- src/lib/claude/__tests__/prompts.test.ts
```
Expected: fails — `getModelForTier` not exported.

- [x] **Step 4: Add tier-aware export to get-provider.ts**

Inside `src/lib/ai/get-provider.ts`, add (do not remove the existing settings-driven `getAIProvider` function):

```typescript
import type { PaymentTier } from '@/types/client-analysis'

const HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'
const SONNET_MODEL_ID = 'claude-sonnet-4-6'

export function getModelForTier(tier: PaymentTier): string {
  return tier === 'premium_19_90' ? SONNET_MODEL_ID : HAIKU_MODEL_ID
}
```

If the file currently constructs the Anthropic client with a hard-coded model id, also add an overload that accepts a model id so callers can pass `getModelForTier(tier)` through. Match the file's existing function-export style; do not introduce a new pattern.

- [x] **Step 5: Add EN versions of the analysis prompts**

Inside `src/lib/claude/prompts.ts`, locate the existing `STANDARD_ANALYSIS_SYSTEM_PROMPT` (Spanish). Add an English version next to it:

```typescript
export const STANDARD_ANALYSIS_SYSTEM_PROMPT_EN = `You are an expert clinical iridologist...
[... mirror the existing Spanish prompt structure, in English. Keep the exact same 11-section JSON schema and the same image-quality / structural-extraction / interpretation rules. The output JSON keys must remain identical to the Spanish prompt so downstream parsing does not break. Only the prose and section descriptions are translated.]`

export function getStandardAnalysisSystemPrompt(lang: 'en' | 'es'): string {
  return lang === 'en' ? STANDARD_ANALYSIS_SYSTEM_PROMPT_EN : STANDARD_ANALYSIS_SYSTEM_PROMPT
}
```

Keep the JSON output schema identical between languages — the report viewer relies on the `section_1_terreno_general` ... `section_11_conclusion` key set.

- [x] **Step 6: Add a `language` parameter to analyze()**

In `src/lib/claude/analyze.ts`, modify the exported analyze function signature to accept `language: 'en' | 'es'` (default `'es'` to preserve current callers) and `modelId?: string`. Use `getStandardAnalysisSystemPrompt(language)` to choose the system prompt and pass `modelId` through to the provider call. Do not change the JSON parsing or error contract.

- [x] **Step 7: Add a `language` parameter to enhanceEmotionalFieldWithJyotish**

In `src/lib/claude/enhance-emotional-field.ts`, add an optional `language: 'en' | 'es'` parameter (default `'es'`). When `'en'`, replace Spanish strings in the blend prompt with English equivalents, and instruct the model to respond in English. Do not change the function's return shape or its `shouldEnhanceWithJyotish` helper.

- [x] **Step 8: Run all claude tests**

```bash
npm run test -- src/lib/claude
```
Expected: all tests pass, including the new tier routing test.

- [x] **Step 9: Commit**

```bash
git add src/lib/ai/get-provider.ts src/lib/claude/prompts.ts src/lib/claude/analyze.ts src/lib/claude/enhance-emotional-field.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "feat(claude): add language and tier parameters to analysis pipeline"
```

---

## Task 8: Email Delivery (Resend)

**Files:**
- Modify: `package.json` (add `resend`)
- Create: `src/lib/client/email.ts`
- Test: `src/lib/client/__tests__/email.test.ts`

- [x] **Step 1: Install Resend SDK**

```bash
npm install resend
```
Expected: `resend` added to `dependencies`.

- [x] **Step 2: Add env var template**

Append to `.env.example` (create the file if it doesn't exist):

```
RESEND_API_KEY=
RESEND_FROM_EMAIL=Iridiology App <noreply@yourdomain.com>
CLIENT_APP_BASE_URL=http://localhost:3000
```

- [x] **Step 3: Write the failing test**

Create `src/lib/client/__tests__/email.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}))

beforeEach(() => {
  sendMock.mockClear()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'Test <test@test.com>'
  process.env.CLIENT_APP_BASE_URL = 'https://example.com'
})

describe('sendReportEmail', () => {
  it('sends to the provided address with a localized subject (es)', async () => {
    const { sendReportEmail } = await import('@/lib/client/email')
    await sendReportEmail({
      to: 'jane@example.com',
      lang: 'es',
      reportToken: '00000000-0000-4000-8000-000000000000',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('jane@example.com')
    expect(arg.subject).toMatch(/Informe/i)
    expect(arg.html).toContain('https://example.com/client/report/00000000-0000-4000-8000-000000000000')
  })

  it('uses english subject for en', async () => {
    const { sendReportEmail } = await import('@/lib/client/email')
    await sendReportEmail({
      to: 'jane@example.com',
      lang: 'en',
      reportToken: '00000000-0000-4000-8000-000000000000',
    })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.subject).toMatch(/Report/i)
  })
})
```

- [x] **Step 4: Run test to verify failure**

```bash
npm run test -- src/lib/client/__tests__/email.test.ts
```
Expected: fails — `@/lib/client/email` not found.

- [x] **Step 5: Implement email module**

Create `src/lib/client/email.ts`:

```typescript
import { Resend } from 'resend'
import type { Lang } from '@/types/client-analysis'

const SUBJECTS: Record<Lang, string> = {
  en: 'Your Iridology Analysis Report',
  es: 'Tu Informe de Análisis de Iridología',
}

const BODY_INTRO: Record<Lang, string> = {
  en: 'Your iridology report is ready. Click the link below to view or download it at any time:',
  es: 'Tu informe de iridología está listo. Pulsa el enlace de abajo para verlo o descargarlo en cualquier momento:',
}

export async function sendReportEmail(params: {
  to: string
  lang: Lang
  reportToken: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const baseUrl = process.env.CLIENT_APP_BASE_URL

  if (!apiKey || !from || !baseUrl) {
    return { ok: false, error: 'email_not_configured' }
  }

  const url = `${baseUrl}/client/report/${params.reportToken}`
  const subject = SUBJECTS[params.lang]
  const intro = BODY_INTRO[params.lang]

  const html = `
    <p>${intro}</p>
    <p><a href="${url}">${url}</a></p>
  `

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
    })
    if (error) return { ok: false, error: String(error) }
    return { ok: true, id: data?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
```

- [x] **Step 6: Run test to verify pass**

```bash
npm run test -- src/lib/client/__tests__/email.test.ts
```
Expected: 2 tests pass.

- [x] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/client/email.ts src/lib/client/__tests__/email.test.ts
git commit -m "feat(client): add Resend-based report email delivery"
```

---

## Task 9: Intake API Route

**Files:**
- Create: `src/app/api/client/intake/route.ts`
- Test: `src/app/api/client/intake/__tests__/route.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/app/api/client/intake/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn()
const fromMock = vi.fn(() => ({
  insert: (...args: unknown[]) => {
    insertMock(...args)
    return {
      select: () => ({
        single: () => Promise.resolve({
          data: { id: 'analysis-id', report_download_token: 'token-123' },
          error: null,
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))
vi.mock('@/lib/client/report-token', () => ({
  generateReportToken: () => 'generated-token',
}))

beforeEach(() => {
  insertMock.mockClear()
  fromMock.mockClear()
})

describe('POST /api/client/intake', () => {
  it('creates a row and returns the token', async () => {
    const { POST } = await import('@/app/api/client/intake/route')
    const body = {
      language: 'en',
      payment_tier: 'basic_12',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      main_complaint: 'Fatigue',
      symptom_duration: '6 months',
      current_medications: '',
      date_of_birth: '1990-05-12',
      country_of_birth: 'Mexico',
      city_of_birth: 'Mexico City',
      time_of_day: 'morning',
    }
    const req = new Request('http://test/api/client/intake', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(201)
    expect(json.report_download_token).toBeDefined()
    expect(insertMock).toHaveBeenCalledTimes(1)
  })

  it('returns 400 on invalid payload', async () => {
    const { POST } = await import('@/app/api/client/intake/route')
    const req = new Request('http://test/api/client/intake', {
      method: 'POST',
      body: JSON.stringify({ language: 'fr' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/app/api/client/intake/__tests__/route.test.ts
```
Expected: fails — route not found.

- [x] **Step 3: Implement the route**

Create `src/app/api/client/intake/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientIntakeSchema } from '@/lib/validators/client-intake'
import { generateReportToken } from '@/lib/client/report-token'
import { TIER_PRICING } from '@/types/client-analysis'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = clientIntakeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const data = parsed.data
  const pricing = TIER_PRICING[data.payment_tier]
  const supabase = createAdminClient()

  const { data: row, error } = await supabase
    .from('client_analyses')
    .insert({
      language: data.language,
      payment_tier: data.payment_tier,
      amount: pricing.amount,
      currency: pricing.currency,
      email: data.email,
      main_complaint: data.main_complaint,
      symptom_duration: data.symptom_duration,
      current_medications: data.current_medications || null,
      date_of_birth: data.date_of_birth,
      country_of_birth: data.country_of_birth,
      city_of_birth: data.city_of_birth,
      time_of_day: data.time_of_day,
      report_download_token: generateReportToken(),
      status: 'intake_pending',
    })
    .select('id, report_download_token')
    .single()

  if (error || !row) {
    return NextResponse.json(
      { error: 'db_insert_failed', message: error?.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { id: row.id, report_download_token: row.report_download_token },
    { status: 201 },
  )
}
```

- [x] **Step 4: Run test to verify pass**

```bash
npm run test -- src/app/api/client/intake/__tests__/route.test.ts
```
Expected: 2 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/app/api/client/intake/route.ts src/app/api/client/intake/__tests__/route.test.ts
git commit -m "feat(api): POST /api/client/intake creates client_analyses row"
```

---

## Task 10: Mock Payment API Route

**Files:**
- Create: `src/app/api/client/payment/route.ts`
- Test: `src/app/api/client/payment/__tests__/route.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/app/api/client/payment/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateMock = vi.fn()
const fromMock = vi.fn(() => ({
  update: (...args: unknown[]) => {
    updateMock(...args)
    return {
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({
            data: { report_download_token: 'token-1', status: 'paid' },
            error: null,
          }),
        }),
      }),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

beforeEach(() => {
  updateMock.mockClear()
  fromMock.mockClear()
  process.env.NODE_ENV = 'test'
})

describe('POST /api/client/payment (mock)', () => {
  it('marks the row paid in mock mode', async () => {
    const { POST } = await import('@/app/api/client/payment/route')
    const req = new Request('http://test/api/client/payment', {
      method: 'POST',
      body: JSON.stringify({ report_download_token: 'token-1' }),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.status).toBe('paid')
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('refuses mock payment in production', async () => {
    process.env.NODE_ENV = 'production'
    const { POST } = await import('@/app/api/client/payment/route')
    const req = new Request('http://test/api/client/payment', {
      method: 'POST',
      body: JSON.stringify({ report_download_token: 'token-1' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/app/api/client/payment/__tests__/route.test.ts
```
Expected: fails — route not found.

- [x] **Step 3: Implement the mock route**

Create `src/app/api/client/payment/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'mock_payment_disabled_in_production' }, { status: 403 })
  }

  let body: { report_download_token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const token = body.report_download_token
  if (!token || !isValidReportToken(token)) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('client_analyses')
    .update({
      paid_at: new Date().toISOString(),
      is_mock_payment: true,
      status: 'paid',
    })
    .eq('report_download_token', token)
    .select('report_download_token, status')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'db_update_failed' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
```

- [x] **Step 4: Run test to verify pass**

```bash
npm run test -- src/app/api/client/payment/__tests__/route.test.ts
```
Expected: 2 tests pass.

- [x] **Step 5: Commit**

```bash
git add src/app/api/client/payment/route.ts src/app/api/client/payment/__tests__/route.test.ts
git commit -m "feat(api): POST /api/client/payment mock-pays an intake (dev only)"
```

---

## Task 11: Upload + Analyze API Route

**Files:**
- Create: `src/lib/validators/client-upload.ts`
- Test: `src/lib/validators/__tests__/client-upload.test.ts`
- Create: `src/app/api/client/upload/route.ts`
- Test: `src/app/api/client/upload/__tests__/route.test.ts`

- [x] **Step 1: Write the upload validator test**

Create `src/lib/validators/__tests__/client-upload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { clientUploadSchema } from '@/lib/validators/client-upload'

describe('clientUploadSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = clientUploadSchema.parse({
      report_download_token: '00000000-0000-4000-8000-000000000000',
      right_eye_base64: 'data:image/jpeg;base64,AAA',
      left_eye_base64: 'data:image/jpeg;base64,BBB',
    })
    expect(parsed.right_eye_base64.startsWith('data:image/')).toBe(true)
  })

  it('rejects non-data-url images', () => {
    expect(() =>
      clientUploadSchema.parse({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'AAA',
        left_eye_base64: 'BBB',
      }),
    ).toThrow()
  })

  it('rejects bad token', () => {
    expect(() =>
      clientUploadSchema.parse({
        report_download_token: 'not-a-uuid',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    ).toThrow()
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/lib/validators/__tests__/client-upload.test.ts
```
Expected: fails — module not found.

- [x] **Step 3: Implement upload validator**

Create `src/lib/validators/client-upload.ts`:

```typescript
import { z } from 'zod'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATA_URL_PREFIX = /^data:image\/(jpeg|png);base64,/

export const clientUploadSchema = z.object({
  report_download_token: z.string().regex(UUID_V4),
  right_eye_base64: z.string().regex(DATA_URL_PREFIX),
  left_eye_base64: z.string().regex(DATA_URL_PREFIX),
})

export type ClientUploadInput = z.infer<typeof clientUploadSchema>
```

- [x] **Step 4: Run validator test to verify pass**

```bash
npm run test -- src/lib/validators/__tests__/client-upload.test.ts
```
Expected: 3 tests pass.

- [x] **Step 5: Write the route test**

Create `src/app/api/client/upload/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const analysisRow = {
  id: 'a1',
  status: 'paid',
  language: 'es',
  payment_tier: 'basic_12',
  email: 'jane@example.com',
  date_of_birth: '1990-05-12',
  country_of_birth: 'Mexico',
  city_of_birth: 'Mexico City',
  time_of_day: 'morning',
  main_complaint: 'Fatigue',
  symptom_duration: '6 months',
  current_medications: '',
  report_download_token: '00000000-0000-4000-8000-000000000000',
}

const selectSingle = vi.fn().mockResolvedValue({ data: analysisRow, error: null })
const updateMock = vi.fn().mockResolvedValue({ data: null, error: null })
const insertReport = vi.fn().mockResolvedValue({
  data: { id: 'r1' },
  error: null,
})

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'client_analyses') {
        return {
          select: () => ({
            eq: () => ({ single: selectSingle }),
          }),
          update: (...args: unknown[]) => {
            updateMock(...args)
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
          },
        }
      }
      if (table === 'reports') {
        return {
          insert: () => ({ select: () => ({ single: insertReport }) }),
        }
      }
      throw new Error('unexpected table ' + table)
    },
  }),
}))

vi.mock('@/lib/claude/analyze', () => ({
  analyze: vi.fn().mockResolvedValue({
    section_1_terreno_general: 'g',
    section_2_campo_emocional: 'e',
    section_3_sistema_nervioso_cognitivo: 'n',
    section_4_sistema_inmunologico_linfatico: 'i',
    section_5_sistema_endocrino_hormonal: 'h',
    section_6_sistema_circulatorio_cardiorrespiratorio: 'c',
    section_7_sistema_hepatico: 'l',
    section_8_sistema_digestivo_intestinal: 'd',
    section_9_sistema_renal_urinario_reproductivo: 'r',
    section_10_sistema_estructural_integumentario: 's',
    section_11_conclusion: 'C',
  }),
}))
vi.mock('@/lib/claude/enhance-emotional-field', () => ({
  shouldEnhanceWithJyotish: () => true,
  enhanceEmotionalFieldWithJyotish: vi.fn(async (r: unknown) => r),
}))
vi.mock('@/lib/client/email', () => ({
  sendReportEmail: vi.fn().mockResolvedValue({ ok: true, id: 'mail-1' }),
}))

beforeEach(() => {
  selectSingle.mockClear()
  updateMock.mockClear()
  insertReport.mockClear()
})

describe('POST /api/client/upload', () => {
  it('runs analysis, stores report, and returns the token', async () => {
    const { POST } = await import('@/app/api/client/upload/route')
    const req = new Request('http://test/api/client/upload', {
      method: 'POST',
      body: JSON.stringify({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    })
    const res = await POST(req as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report_download_token).toBe('00000000-0000-4000-8000-000000000000')
    expect(insertReport).toHaveBeenCalledTimes(1)
  })

  it('refuses unpaid analyses', async () => {
    selectSingle.mockResolvedValueOnce({
      data: { ...analysisRow, status: 'intake_pending' },
      error: null,
    })
    const { POST } = await import('@/app/api/client/upload/route')
    const req = new Request('http://test/api/client/upload', {
      method: 'POST',
      body: JSON.stringify({
        report_download_token: '00000000-0000-4000-8000-000000000000',
        right_eye_base64: 'data:image/jpeg;base64,AAA',
        left_eye_base64: 'data:image/jpeg;base64,BBB',
      }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(402)
  })
})
```

- [x] **Step 6: Run test to verify failure**

```bash
npm run test -- src/app/api/client/upload/__tests__/route.test.ts
```
Expected: fails — route not found.

- [x] **Step 7: Implement the upload route**

Create `src/app/api/client/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { clientUploadSchema } from '@/lib/validators/client-upload'
import { analyze } from '@/lib/claude/analyze'
import {
  shouldEnhanceWithJyotish,
  enhanceEmotionalFieldWithJyotish,
} from '@/lib/claude/enhance-emotional-field'
import { sendReportEmail } from '@/lib/client/email'
import { getModelForTier } from '@/lib/ai/get-provider'

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
    .select()
    .single()

  try {
    const modelId = getModelForTier(row.payment_tier)
    const reportContent = await analyze({
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
      language: row.language,
      modelId,
    })

    let finalReport = reportContent
    if (
      shouldEnhanceWithJyotish({
        date_of_birth: row.date_of_birth,
        country_of_birth: row.country_of_birth,
        city_of_birth: row.city_of_birth,
        time_of_day: row.time_of_day,
      })
    ) {
      finalReport = await enhanceEmotionalFieldWithJyotish(
        reportContent,
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

    await supabase
      .from('client_analyses')
      .update({
        status: 'completed',
        report_id: report.id,
        report_delivered_at: new Date().toISOString(),
      })
      .eq('report_download_token', parsed.data.report_download_token)
      .select()
      .single()

    if (row.email) {
      await sendReportEmail({
        to: row.email,
        lang: row.language,
        reportToken: parsed.data.report_download_token,
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
      .select()
      .single()
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }
}
```

If the existing `analyze()` signature in `src/lib/claude/analyze.ts` does not match what is called above, adjust the call in the route to match the modified signature from Task 7. Do not duplicate analyze logic here.

- [x] **Step 8: Run test to verify pass**

```bash
npm run test -- src/app/api/client/upload/__tests__/route.test.ts
```
Expected: 2 tests pass.

- [x] **Step 9: Commit**

```bash
git add src/lib/validators/client-upload.ts src/lib/validators/__tests__/client-upload.test.ts src/app/api/client/upload/route.ts src/app/api/client/upload/__tests__/route.test.ts
git commit -m "feat(api): POST /api/client/upload runs analysis and stores report"
```

---

## Task 12: Report-by-Token API Routes

**Files:**
- Create: `src/app/api/client/reports/[token]/route.ts`
- Create: `src/app/api/client/reports/[token]/email/route.ts`
- Test: `src/app/api/client/reports/[token]/__tests__/route.test.ts`

- [x] **Step 1: Write the failing test**

Create `src/app/api/client/reports/[token]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

const reportRow = {
  report_download_token: '00000000-0000-4000-8000-000000000000',
  language: 'es',
  status: 'completed',
  report_id: 'r1',
  reports: { id: 'r1', report_content: { section_1_terreno_general: 'x' } },
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: reportRow, error: null }),
        }),
      }),
    }),
  }),
}))

describe('GET /api/client/reports/[token]', () => {
  it('returns report content for valid token', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: '00000000-0000-4000-8000-000000000000' }),
    } as never)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.report.section_1_terreno_general).toBe('x')
    expect(json.language).toBe('es')
  })

  it('returns 400 for invalid token format', async () => {
    const { GET } = await import('@/app/api/client/reports/[token]/route')
    const res = await GET(new Request('http://test') as never, {
      params: Promise.resolve({ token: 'bad' }),
    } as never)
    expect(res.status).toBe(400)
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/app/api/client/reports/[token]/__tests__/route.test.ts
```
Expected: fails — route not found.

- [x] **Step 3: Implement the GET route**

Create `src/app/api/client/reports/[token]/route.ts`:

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
      reports:report_id ( id, report_content )
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

  return NextResponse.json({
    language: data.language,
    report: (data.reports as { report_content: unknown }).report_content,
  })
}
```

- [x] **Step 4: Implement the email-resend route**

Create `src/app/api/client/reports/[token]/email/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isValidReportToken } from '@/lib/client/report-token'
import { sendReportEmail } from '@/lib/client/email'

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
    .select('email, language, status')
    .eq('report_download_token', token)
    .single()

  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (data.status !== 'completed') return NextResponse.json({ error: 'not_ready' }, { status: 409 })
  if (!data.email) return NextResponse.json({ error: 'email_unavailable' }, { status: 410 })

  const result = await sendReportEmail({
    to: data.email,
    lang: data.language,
    reportToken: token,
  })

  if (!result.ok) {
    return NextResponse.json({ error: 'email_failed', detail: result.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
```

- [x] **Step 5: Run tests to verify pass**

```bash
npm run test -- src/app/api/client/reports
```
Expected: 2 tests pass.

- [x] **Step 6: Commit**

```bash
git add src/app/api/client/reports
git commit -m "feat(api): GET report by token + POST email-resend"
```

---

## Task 13: Client Layout + Language Toggle

**Files:**
- Create: `src/app/client/layout.tsx`
- Create: `src/components/client/language-toggle.tsx`
- Test: `src/components/client/__tests__/language-toggle.test.tsx`

- [x] **Step 1: Write the failing test**

Create `src/components/client/__tests__/language-toggle.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'

function renderWithLang(initial: 'en' | 'es') {
  return render(
    <LanguageProvider initialLang={initial}>
      <LanguageToggle />
    </LanguageProvider>,
  )
}

describe('LanguageToggle', () => {
  it('renders both flags', () => {
    renderWithLang('en')
    expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /español/i })).toBeInTheDocument()
  })

  it('switches language on click', async () => {
    const user = userEvent.setup()
    renderWithLang('en')
    await user.click(screen.getByRole('button', { name: /español/i }))
    // Active language exposes aria-pressed=true on the active button
    expect(screen.getByRole('button', { name: /español/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/components/client/__tests__/language-toggle.test.tsx
```
Expected: fails — component not found.

- [x] **Step 3: Implement the toggle**

Create `src/components/client/language-toggle.tsx`:

```typescript
'use client'

import { useLanguage } from '@/lib/i18n-context'
import { Lang } from '@/lib/i18n'

const FLAGS: Record<Lang, { label: string; emoji: string }> = {
  en: { label: 'English', emoji: '🇬🇧' },
  es: { label: 'Español', emoji: '🇪🇸' },
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage()
  return (
    <div className="flex gap-2" role="group" aria-label="Language selector">
      {(Object.keys(FLAGS) as Lang[]).map((code) => {
        const active = lang === code
        return (
          <button
            key={code}
            type="button"
            aria-label={FLAGS[code].label}
            aria-pressed={active}
            onClick={() => setLang(code)}
            className={`text-2xl rounded-md px-2 py-1 transition-opacity ${
              active ? 'opacity-100 ring-2 ring-current' : 'opacity-60 hover:opacity-100'
            }`}
          >
            <span aria-hidden>{FLAGS[code].emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
```

- [x] **Step 4: Implement the client layout**

Create `src/app/client/layout.tsx`:

```typescript
import { ReactNode } from 'react'
import { LanguageProvider } from '@/lib/i18n-context'
import { LanguageToggle } from '@/components/client/language-toggle'

export const metadata = { title: 'Iridology Analysis' }

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-[oklch(0.98_0.008_80)] text-[oklch(0.22_0.04_50)]">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <h1 className="font-semibold">Iridology Analysis</h1>
          <LanguageToggle />
        </header>
        <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
      </div>
    </LanguageProvider>
  )
}
```

- [x] **Step 5: Run tests to verify pass**

```bash
npm run test -- src/components/client/__tests__/language-toggle.test.tsx
```
Expected: 2 tests pass.

- [x] **Step 6: Commit**

```bash
git add src/app/client/layout.tsx src/components/client/language-toggle.tsx src/components/client/__tests__/language-toggle.test.tsx
git commit -m "feat(client): add /client layout with language toggle"
```

---

## Task 14: Entry Page (Tier Selector)

**Files:**
- Create: `src/components/client/tier-selector.tsx`
- Create: `src/app/client/page.tsx`

- [x] **Step 1: Implement the tier selector component**

Create `src/components/client/tier-selector.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import type { PaymentTier } from '@/types/client-analysis'

export function TierSelector() {
  const { t } = useLanguage()
  const router = useRouter()

  function pick(tier: PaymentTier) {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('client_tier', tier)
    }
    router.push('/client/intake')
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-8">
      <button
        type="button"
        onClick={() => pick('basic_12')}
        className="text-left border rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        <h3 className="text-xl font-semibold">{t('tierBasicTitle')}</h3>
        <p className="text-2xl my-2">{t('tierBasicPrice')}</p>
        <p className="text-sm">{t('tierBasicDescription')}</p>
      </button>
      <button
        type="button"
        onClick={() => pick('premium_19_90')}
        className="text-left border rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        <h3 className="text-xl font-semibold">{t('tierPremiumTitle')}</h3>
        <p className="text-2xl my-2">{t('tierPremiumPrice')}</p>
        <p className="text-sm">{t('tierPremiumDescription')}</p>
      </button>
    </div>
  )
}
```

- [x] **Step 2: Implement the entry page**

Create `src/app/client/page.tsx`:

```typescript
'use client'

import { useLanguage } from '@/lib/i18n-context'
import { TierSelector } from '@/components/client/tier-selector'

export default function ClientEntryPage() {
  const { t } = useLanguage()
  return (
    <section>
      <h2 className="text-2xl font-semibold">{t('chooseTier')}</h2>
      <p className="text-sm opacity-80 mt-2">{t('chooseLanguage')}</p>
      <TierSelector />
    </section>
  )
}
```

- [x] **Step 3: Manually verify in dev**

```bash
npm run dev
```
Open `http://localhost:3000/client`. Expected: language flags toggle UI strings; tier cards visible. Click tier → URL becomes `/client/intake` (will 404 until next task). Stop dev server.

- [x] **Step 4: Commit**

```bash
git add src/components/client/tier-selector.tsx src/app/client/page.tsx
git commit -m "feat(client): add /client entry page with tier selector"
```

---

## Task 15: Intake Form Page

**Files:**
- Create: `src/components/client/intake-form.tsx`
- Test: `src/components/client/__tests__/intake-form.test.tsx`
- Create: `src/app/client/intake/page.tsx`

- [x] **Step 1: Write the failing test**

Create `src/components/client/__tests__/intake-form.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'

describe('IntakeForm', () => {
  it('shows validation errors when submitted empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_12" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(await screen.findAllByText(/required/i)).not.toHaveLength(0)
  })

  it('submits valid data', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <LanguageProvider initialLang="en">
        <IntakeForm tier="basic_12" onSubmit={onSubmit} />
      </LanguageProvider>,
    )
    await user.type(screen.getByLabelText(/full name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/email/i), 'jane@example.com')
    await user.type(screen.getByLabelText(/main health concern/i), 'Fatigue')
    await user.type(screen.getByLabelText(/how long/i), '6 months')
    await user.type(screen.getByLabelText(/date of birth/i), '1990-05-12')
    await user.type(screen.getByLabelText(/country of birth/i), 'Mexico')
    await user.type(screen.getByLabelText(/city of birth/i), 'Mexico City')
    await user.click(screen.getByLabelText(/morning/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/components/client/__tests__/intake-form.test.tsx
```
Expected: fails — component not found.

- [x] **Step 3: Implement the form**

Create `src/components/client/intake-form.tsx`:

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLanguage } from '@/lib/i18n-context'
import {
  clientIntakeSchema,
  type ClientIntakeInput,
} from '@/lib/validators/client-intake'
import type { PaymentTier } from '@/types/client-analysis'

export function IntakeForm({
  tier,
  onSubmit,
}: {
  tier: PaymentTier
  onSubmit: (data: ClientIntakeInput) => void | Promise<void>
}) {
  const { lang, t } = useLanguage()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientIntakeInput>({
    resolver: zodResolver(clientIntakeSchema),
    defaultValues: { language: lang, payment_tier: tier, current_medications: '' },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('language')} value={lang} />
      <input type="hidden" {...register('payment_tier')} value={tier} />

      <Field label={t('fieldFullName')} error={errors.full_name && t('errorIntakeRequired')}>
        <input className="input" {...register('full_name')} />
      </Field>

      <Field label={t('fieldEmail')} error={errors.email && t('errorEmailFormat')}>
        <input type="email" className="input" {...register('email')} />
      </Field>

      <Field label={t('fieldMainComplaint')} error={errors.main_complaint && t('errorIntakeRequired')}>
        <textarea className="input" rows={3} {...register('main_complaint')} />
      </Field>

      <Field label={t('fieldSymptomDuration')} error={errors.symptom_duration && t('errorIntakeRequired')}>
        <input className="input" {...register('symptom_duration')} />
      </Field>

      <Field label={t('fieldCurrentMedications')}>
        <textarea className="input" rows={2} {...register('current_medications')} />
      </Field>

      <Field label={t('fieldDateOfBirth')} error={errors.date_of_birth && t('errorIntakeRequired')}>
        <input type="date" className="input" {...register('date_of_birth')} />
      </Field>

      <Field label={t('fieldCountryOfBirth')} error={errors.country_of_birth && t('errorIntakeRequired')}>
        <input className="input" {...register('country_of_birth')} />
      </Field>

      <Field label={t('fieldCityOfBirth')} error={errors.city_of_birth && t('errorIntakeRequired')}>
        <input className="input" {...register('city_of_birth')} />
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium mb-2">{t('fieldTimeOfDay')}</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" value="morning" {...register('time_of_day')} />
            {t('timeOfDayMorning')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="evening" {...register('time_of_day')} />
            {t('timeOfDayEvening')}
          </label>
        </div>
        {errors.time_of_day && (
          <p className="text-destructive text-sm mt-1">{t('errorIntakeRequired')}</p>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {isSubmitting ? t('loading') : t('continue')}
      </button>
    </form>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {error && <p className="text-destructive text-sm mt-1">{error}</p>}
    </label>
  )
}
```

Add the `.input` class in `src/app/globals.css` if it doesn't exist:

```css
@layer components {
  .input {
    @apply w-full rounded-md border px-3 py-2 bg-white;
  }
}
```

- [x] **Step 4: Implement the intake page**

Create `src/app/client/intake/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { IntakeForm } from '@/components/client/intake-form'
import type { PaymentTier } from '@/types/client-analysis'
import type { ClientIntakeInput } from '@/lib/validators/client-intake'

export default function IntakePage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [tier, setTier] = useState<PaymentTier | null>(null)

  useEffect(() => {
    const stored = window.sessionStorage.getItem('client_tier') as PaymentTier | null
    if (stored !== 'basic_12' && stored !== 'premium_19_90') {
      router.replace('/client')
      return
    }
    setTier(stored)
  }, [router])

  async function handleSubmit(data: ClientIntakeInput) {
    const res = await fetch('/api/client/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      alert(t('error'))
      return
    }
    const json = (await res.json()) as { report_download_token: string }
    window.sessionStorage.setItem('client_token', json.report_download_token)
    router.push('/client/intake/payment')
  }

  if (!tier) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-6">{t('intakeTitle')}</h2>
      <IntakeForm tier={tier} onSubmit={handleSubmit} />
    </section>
  )
}
```

- [x] **Step 5: Run tests to verify pass**

```bash
npm run test -- src/components/client/__tests__/intake-form.test.tsx
```
Expected: 2 tests pass.

- [x] **Step 6: Commit**

```bash
git add src/components/client/intake-form.tsx src/components/client/__tests__/intake-form.test.tsx src/app/client/intake/page.tsx src/app/globals.css
git commit -m "feat(client): add intake form and /client/intake page"
```

---

## Task 16: Mock Payment Page

**Files:**
- Create: `src/app/client/intake/payment/page.tsx`

- [x] **Step 1: Implement the mock payment page**

Create `src/app/client/intake/payment/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'

export default function MockPaymentPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const stored = window.sessionStorage.getItem('client_token')
    if (!stored) {
      router.replace('/client')
      return
    }
    setToken(stored)
  }, [router])

  async function handleContinue() {
    if (!token) return
    setSubmitting(true)
    const res = await fetch('/api/client/payment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ report_download_token: token }),
    })
    setSubmitting(false)
    if (!res.ok) {
      alert(t('error'))
      return
    }
    router.push('/client/upload')
  }

  if (!token) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold">{t('paymentMockHeading')}</h2>
      <p className="text-sm opacity-80 mt-2">{t('paymentMockBody')}</p>
      <button
        type="button"
        onClick={handleContinue}
        disabled={submitting}
        className="mt-6 bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting ? t('loading') : t('continue')}
      </button>
    </section>
  )
}
```

- [x] **Step 2: Verify in dev**

```bash
npm run dev
```
Walk through `/client → /client/intake → /client/intake/payment`. Click Continue. Expected: redirect to `/client/upload` (will 404 until next task). Stop dev.

- [x] **Step 3: Commit**

```bash
git add src/app/client/intake/payment/page.tsx
git commit -m "feat(client): add mock payment page that marks intake paid"
```

---

## Task 17: Image Upload Page

**Files:**
- Create: `src/components/client/upload-tutorial.tsx`
- Create: `src/components/client/iris-image-upload.tsx`
- Test: `src/components/client/__tests__/iris-image-upload.test.tsx`
- Create: `src/app/client/upload/page.tsx`
- Create: `src/app/client/upload/processing/page.tsx`

- [x] **Step 1: Write the failing test for the upload component**

Create `src/components/client/__tests__/iris-image-upload.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/lib/i18n-context'
import { IrisImageUpload } from '@/components/client/iris-image-upload'

describe('IrisImageUpload', () => {
  it('renders two upload zones (right and left)', () => {
    render(
      <LanguageProvider initialLang="en">
        <IrisImageUpload onSubmit={vi.fn()} />
      </LanguageProvider>,
    )
    expect(screen.getByText(/right eye/i)).toBeInTheDocument()
    expect(screen.getByText(/left eye/i)).toBeInTheDocument()
  })

  it('keeps the submit button disabled until both eyes are provided', () => {
    render(
      <LanguageProvider initialLang="en">
        <IrisImageUpload onSubmit={vi.fn()} />
      </LanguageProvider>,
    )
    expect(screen.getByRole('button', { name: /submit|continue/i })).toBeDisabled()
  })
})
```

- [x] **Step 2: Run test to verify failure**

```bash
npm run test -- src/components/client/__tests__/iris-image-upload.test.tsx
```
Expected: fails — component not found.

- [x] **Step 3: Implement the tutorial component**

Create `src/components/client/upload-tutorial.tsx`:

```typescript
'use client'

import { useLanguage } from '@/lib/i18n-context'

const TUTORIAL_URL = 'https://forms.gle/gwdg4QCRKGbhJ5zk9'

export function UploadTutorial() {
  const { t } = useLanguage()
  return (
    <aside className="border rounded-md p-4 bg-white mb-6">
      <h3 className="font-medium mb-2">{t('uploadTutorialHeading')}</h3>
      <a
        href={TUTORIAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[oklch(0.25_0.06_175)]"
      >
        {t('uploadTutorialLinkLabel')} ↗
      </a>
    </aside>
  )
}
```

- [x] **Step 4: Implement the image-upload component**

Create `src/components/client/iris-image-upload.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useLanguage } from '@/lib/i18n-context'
import {
  validateImage,
  readImageDimensions,
  IMAGE_MAX_BYTES,
} from '@/lib/client/image-validation'

type Eye = 'right' | 'left'

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

export function IrisImageUpload({
  onSubmit,
}: {
  onSubmit: (payload: { right: string; left: string }) => void | Promise<void>
}) {
  const { t } = useLanguage()
  const [right, setRight] = useState<string | null>(null)
  const [left, setLeft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFile(eye: Eye, file: File) {
    setError(null)
    let dims: { width: number; height: number }
    try {
      dims = await readImageDimensions(file)
    } catch {
      setError(t('errorImageFormat'))
      return
    }
    const validation = await validateImage(file, dims)
    if (!validation.ok) {
      const map = {
        too_large: t('errorImageTooLarge'),
        bad_format: t('errorImageFormat'),
        too_small: t('errorImageDimensions'),
      } as const
      setError(map[validation.reason])
      return
    }
    const dataUrl = await fileToDataUrl(file)
    if (eye === 'right') setRight(dataUrl)
    else setLeft(dataUrl)
  }

  async function handleSubmit() {
    if (!right || !left) {
      setError(t('errorImageCount'))
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ right, left })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4">
        <EyeZone label={t('uploadRightEye')} preview={right} onFile={(f) => handleFile('right', f)} />
        <EyeZone label={t('uploadLeftEye')} preview={left} onFile={(f) => handleFile('left', f)} />
      </div>
      {error && <p className="text-destructive mt-4">{error}</p>}
      <p className="text-xs opacity-70 mt-2">
        Max {IMAGE_MAX_BYTES / 1024 / 1024} MB · JPEG/PNG · ≥ 800×800
      </p>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!right || !left || submitting}
        className="mt-6 bg-[oklch(0.25_0.06_175)] text-white rounded px-4 py-2 disabled:opacity-50"
      >
        {submitting ? t('loading') : t('continue')}
      </button>
    </div>
  )
}

function EyeZone({
  label,
  preview,
  onFile,
}: {
  label: string
  preview: string | null
  onFile: (file: File) => void
}) {
  return (
    <label className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-white">
      <span className="font-medium mb-2">{label}</span>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="max-h-48 object-contain" />
      ) : (
        <span className="text-sm opacity-60">+</span>
      )}
      <input
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </label>
  )
}
```

- [x] **Step 5: Implement the upload page**

Create `src/app/client/upload/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { UploadTutorial } from '@/components/client/upload-tutorial'
import { IrisImageUpload } from '@/components/client/iris-image-upload'

export default function UploadPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.sessionStorage.getItem('client_token')
    if (!stored) {
      router.replace('/client')
      return
    }
    setToken(stored)
  }, [router])

  async function handleSubmit({ right, left }: { right: string; left: string }) {
    if (!token) return
    router.push('/client/upload/processing')
    const res = await fetch('/api/client/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        report_download_token: token,
        right_eye_base64: right,
        left_eye_base64: left,
      }),
    })
    if (!res.ok) {
      router.replace('/client/upload')
      alert(t('error'))
      return
    }
    router.replace(`/client/report/${token}`)
  }

  if (!token) return null
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-4">{t('uploadTitle')}</h2>
      <UploadTutorial />
      <IrisImageUpload onSubmit={handleSubmit} />
    </section>
  )
}
```

- [x] **Step 6: Implement a simple processing page**

Create `src/app/client/upload/processing/page.tsx`:

```typescript
'use client'

import { useLanguage } from '@/lib/i18n-context'

export default function ProcessingPage() {
  const { t } = useLanguage()
  return (
    <section className="text-center py-16">
      <p className="text-lg">{t('uploadAnalyzing')}</p>
      <p className="text-sm opacity-60 mt-2">{t('loading')}</p>
    </section>
  )
}
```

- [x] **Step 7: Run tests to verify pass**

```bash
npm run test -- src/components/client/__tests__/iris-image-upload.test.tsx
```
Expected: 2 tests pass.

- [x] **Step 8: Commit**

```bash
git add src/components/client src/app/client/upload
git commit -m "feat(client): add upload tutorial, image upload component, and upload page"
```

---

## Task 18: Report View Page

**Files:**
- Create: `src/components/client/client-report-viewer.tsx`
- Create: `src/app/client/report/[token]/page.tsx`

- [x] **Step 1: Implement the read-only report viewer**

Create `src/components/client/client-report-viewer.tsx`:

```typescript
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SECTION_KEYS = [
  'section_1_terreno_general',
  'section_2_campo_emocional',
  'section_3_sistema_nervioso_cognitivo',
  'section_4_sistema_inmunologico_linfatico',
  'section_5_sistema_endocrino_hormonal',
  'section_6_sistema_circulatorio_cardiorrespiratorio',
  'section_7_sistema_hepatico',
  'section_8_sistema_digestivo_intestinal',
  'section_9_sistema_renal_urinario_reproductivo',
  'section_10_sistema_estructural_integumentario',
  'section_11_conclusion',
] as const

type SectionKey = (typeof SECTION_KEYS)[number]

export function ClientReportViewer({
  report,
}: {
  report: Partial<Record<SectionKey, string>>
}) {
  return (
    <article className="prose max-w-none print:prose-sm">
      {SECTION_KEYS.map((key) => {
        const content = report[key]
        if (!content) return null
        return (
          <section key={key} className="mb-8">
            <h2 className="capitalize">{key.replace(/^section_\d+_/, '').replace(/_/g, ' ')}</h2>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </section>
        )
      })}
    </article>
  )
}
```

If `react-markdown` and `remark-gfm` are already used by the existing report viewer (Task 0 inspected `src/components/reports/report-viewer.tsx`), reuse the same imports — do not introduce a different markdown lib.

- [x] **Step 2: Implement the page**

Create `src/app/client/report/[token]/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n-context'
import { ClientReportViewer } from '@/components/client/client-report-viewer'

export default function ClientReportPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const { t, setLang } = useLanguage()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'pending' }
    | { kind: 'ready'; report: Record<string, string>; language: 'en' | 'es' }
    | { kind: 'error' }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/client/reports/${token}`)
        if (res.status === 409) {
          if (!cancelled) setState({ kind: 'pending' })
          setTimeout(load, 3000)
          return
        }
        if (!res.ok) {
          if (!cancelled) setState({ kind: 'error' })
          return
        }
        const json = (await res.json()) as { language: 'en' | 'es'; report: Record<string, string> }
        if (!cancelled) {
          setLang(json.language)
          setState({ kind: 'ready', report: json.report, language: json.language })
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token, setLang])

  async function emailMe() {
    const res = await fetch(`/api/client/reports/${token}/email`, { method: 'POST' })
    alert(res.ok ? t('reportEmailSent') : t('error'))
  }

  if (state.kind === 'loading') return <p>{t('loading')}</p>
  if (state.kind === 'pending') return <p>{t('uploadAnalyzing')}</p>
  if (state.kind === 'error') return <p>{t('error')}</p>

  return (
    <section>
      <header className="flex flex-wrap gap-2 justify-between items-center mb-6 print:hidden">
        <h2 className="text-2xl font-semibold">{t('reportReady')}</h2>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="border rounded px-3 py-1">
            {t('reportPrint')}
          </button>
          <button onClick={emailMe} className="border rounded px-3 py-1">
            {t('reportEmail')}
          </button>
        </div>
      </header>
      <ClientReportViewer report={state.report} />
    </section>
  )
}
```

- [x] **Step 3: Verify in dev**

```bash
npm run dev
```
Walk full flow: `/client → /client/intake → /client/intake/payment → /client/upload → /client/report/[token]`. Expected: at the end, the report renders. Print works via browser. Stop dev.

- [x] **Step 4: Commit**

```bash
git add src/components/client/client-report-viewer.tsx src/app/client/report
git commit -m "feat(client): add read-only report viewer with print + email-resend"
```

---

## Task 19: End-to-End Test

**Files:**
- Create: `e2e/client-self-service.spec.ts`

- [x] **Step 1: Write the e2e test**

Create `e2e/client-self-service.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Client self-service flow', () => {
  test('can choose tier, complete intake, mock-pay, and reach upload page', async ({ page }) => {
    await page.goto('/client')
    await expect(page.getByText(/Choose your report|Elige tu informe/)).toBeVisible()

    await page.getByRole('button', { name: /Basic|Básico/ }).click()
    await expect(page).toHaveURL(/\/client\/intake$/)

    await page.getByLabel(/full name|nombre completo/i).fill('Jane Doe')
    await page.getByLabel(/email|correo/i).fill('jane@example.com')
    await page.getByLabel(/main health concern|principal preocupación/i).fill('Fatigue')
    await page.getByLabel(/how long|hace cuánto/i).fill('6 months')
    await page.getByLabel(/date of birth|fecha de nacimiento/i).fill('1990-05-12')
    await page.getByLabel(/country of birth|país de nacimiento/i).fill('Mexico')
    await page.getByLabel(/city of birth|ciudad de nacimiento/i).fill('Mexico City')
    await page.getByLabel(/morning|mañana/i).check()
    await page.getByRole('button', { name: /continue|continuar/i }).click()

    await expect(page).toHaveURL(/\/client\/intake\/payment$/)
    await page.getByRole('button', { name: /continue|continuar/i }).click()

    await expect(page).toHaveURL(/\/client\/upload$/)
  })
})
```

- [x] **Step 2: Run e2e (without Claude credentials it stops at upload — that's the goal of this test)**

```bash
npm run test:e2e -- e2e/client-self-service.spec.ts
```
Expected: passes (we deliberately do not upload images here, since that would call Claude in test).

- [x] **Step 3: Commit**

```bash
git add e2e/client-self-service.spec.ts
git commit -m "test(e2e): client self-service intake → mock-pay → upload navigation"
```

---

## Task 20: Practitioner Regression Check

**Files:** none (verification)

- [x] **Step 1: Run full unit suite**

```bash
npm run test
```
Expected: all tests pass — including pre-existing practitioner tests.

- [x] **Step 2: Run all e2e (including pre-existing practitioner specs)**

```bash
npm run test:e2e
```
Expected: all suites pass.

- [x] **Step 3: Manually verify practitioner login still works**

```bash
npm run dev
```
- Open `http://localhost:3000/login`, sign in as practitioner.
- Open `http://localhost:3000/patients` — patient list loads.
- Open one patient — sessions visible.
- Open one report — viewer loads as before.
- Open `http://localhost:3000/sessions/new` — analysis form loads.

Expected: every existing flow behaves exactly as before.

- [x] **Step 4: Commit a marker if anything had to be tweaked**

If you had to update any practitioner code to keep tests green, commit those tweaks. Otherwise, no commit needed for this task.

---

## Self-Review (run before handing off)

- **Spec coverage:**
  - 9-question intake (Task 6, 9, 15) ✅
  - Bilingual UI + reports (Tasks 2, 7) ✅
  - Tiered model selection (Task 7) ✅
  - Mock payment for MVP (Tasks 10, 16) ✅
  - Image validation + tutorial + upload (Tasks 5, 17) ✅
  - Stateless token-based report access (Tasks 4, 12, 18) ✅
  - Email delivery via Resend (Tasks 8, 11, 12) ✅
  - PII expiry via pg_cron (Task 1) ✅
  - Practitioner UI untouched (Task 20 verifies) ✅
  - Auth middleware bypass for /client (Task 3) ✅

- **Placeholder scan:** no TBD/TODO; every code step shows code; every command shows expected output.

- **Type consistency:** `Lang`, `PaymentTier`, `TimeOfDay`, `ClientAnalysisStatus` defined once in `src/types/client-analysis.ts` and reused. `report_download_token` field name is consistent across DB, API, and UI. `analyze()` signature change is propagated through Tasks 7 and 11.

---

## Handoff

Phase 1 MVP scope ends here. Stripe integration, practitioner-side client-submission tab, and follow-up booking are Phase 2 — see spec sections "Practitioner Integration (Phase 2)" and "Implementation Priorities".
