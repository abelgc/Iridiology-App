# AI Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the practitioner to choose between Anthropic (Claude) and OpenAI (GPT-4o) via a Settings page, with API keys stored in Supabase.

**Architecture:** Add a `settings` table to Supabase that stores `active_provider`, `anthropic_api_key`, and `openai_api_key`. Introduce a thin `AIProvider` abstraction in `src/lib/ai/` that both providers implement. Refactor `analyze.ts`, `compare.ts`, `review.ts`, and `chat.ts` to use the provider instead of calling the Anthropic SDK directly. Add a Settings page at `/settings` with a form to enter keys and select the active provider.

**Tech Stack:** Next.js 16 App Router, Supabase (admin client, settings table), `@anthropic-ai/sdk` (existing), `openai` npm package (new), TypeScript, Tailwind CSS v4.

---

## File Map

| Action   | Path                                              | Purpose                                              |
|----------|---------------------------------------------------|------------------------------------------------------|
| Create   | `src/lib/ai/types.ts`                             | `CompletionRequest`, `CompletionResponse`, `AIProvider` interface |
| Create   | `src/lib/ai/anthropic-provider.ts`               | Anthropic implementation of `AIProvider`             |
| Create   | `src/lib/ai/openai-provider.ts`                  | OpenAI implementation of `AIProvider`                |
| Create   | `src/lib/ai/get-provider.ts`                     | Factory — reads `settings` table, returns active provider |
| Create   | `src/app/api/settings/route.ts`                   | GET + POST API route for settings                    |
| Create   | `src/app/(app)/settings/page.tsx`                 | Settings page (Server Component)                     |
| Create   | `src/components/settings/provider-form.tsx`       | Client form for API keys + provider toggle           |
| Modify   | `src/lib/claude/analyze.ts`                       | Use `getAIProvider()` instead of `anthropic` directly |
| Modify   | `src/lib/claude/compare.ts`                       | Same                                                 |
| Modify   | `src/lib/claude/review.ts`                        | Same                                                 |
| Modify   | `src/lib/claude/chat.ts`                          | Same                                                 |
| Modify   | `src/components/layout/sidebar.tsx`               | Add Settings nav item                                |
| Modify   | `docs/schema.sql`                                 | Add `settings` table + RLS policy                   |

---

## Task 1: Install OpenAI SDK + add settings table to DB

**Files:**
- Modify: `package.json` (via npm)
- Modify: `docs/schema.sql`

- [ ] **Step 1: Install OpenAI SDK**

```bash
cd C:/Dev/iridology-app
npm install openai
```

Expected: `openai` appears in `package.json` dependencies.

- [ ] **Step 2: Add settings table to schema.sql**

In `docs/schema.sql`, append after the `report_corrections` table block:

```sql
-- Settings table (key-value store for app configuration)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage settings"
  ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Seed defaults (no-op if already present)
INSERT INTO settings (key, value) VALUES
  ('active_provider', 'anthropic'),
  ('anthropic_api_key', ''),
  ('openai_api_key', '')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 3: Run the settings table SQL in Supabase dashboard**

Open Supabase dashboard → SQL Editor → paste the block from Step 2 → Run.
Expected: table `settings` created with 3 seed rows.

- [ ] **Step 4: Commit**

```bash
git add docs/schema.sql package.json package-lock.json
git commit -m "feat: add settings table schema + install openai sdk"
```

---

## Task 2: Create AI provider abstraction

**Files:**
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/anthropic-provider.ts`
- Create: `src/lib/ai/openai-provider.ts`
- Create: `src/lib/ai/get-provider.ts`

- [ ] **Step 1: Create `src/lib/ai/types.ts`**

```typescript
export interface CompletionRequest {
  systemPrompt: string
  userText: string
  images: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }>
  maxTokens: number
}

export interface CompletionResponse {
  text: string
  stopReason: 'end_turn' | 'max_tokens' | string
}

export interface AIProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>
}
```

- [ ] **Step 2: Create `src/lib/ai/anthropic-provider.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class AnthropicProvider implements AIProvider {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 120000 })
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: request.userText },
            ...request.images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.data,
              },
            })),
          ],
        },
      ],
    })

    const textBlock = response.content.find((c) => c.type === 'text')
    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: response.stop_reason ?? 'end_turn',
    }
  }
}
```

- [ ] **Step 3: Create `src/lib/ai/openai-provider.ts`**

```typescript
import OpenAI from 'openai'
import type { AIProvider, CompletionRequest, CompletionResponse } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, timeout: 120000 })
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: request.maxTokens,
      messages: [
        { role: 'system', content: request.systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: request.userText },
            ...request.images.map((img) => ({
              type: 'image_url' as const,
              image_url: {
                url: `data:${img.mediaType};base64,${img.data}`,
              },
            })),
          ],
        },
      ],
    })

    const choice = response.choices[0]
    return {
      text: choice?.message?.content ?? '',
      stopReason: choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    }
  }
}
```

- [ ] **Step 4: Create `src/lib/ai/get-provider.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/server'
import { AnthropicProvider } from './anthropic-provider'
import { OpenAIProvider } from './openai-provider'
import type { AIProvider } from './types'

export async function getAIProvider(): Promise<AIProvider> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['active_provider', 'anthropic_api_key', 'openai_api_key'])

  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value ?? '']))

  const activeProvider = map['active_provider'] ?? 'anthropic'

  if (activeProvider === 'openai') {
    const key = map['openai_api_key'] || process.env.OPENAI_API_KEY || ''
    return new OpenAIProvider(key)
  }

  const key = map['anthropic_api_key'] || process.env.ANTHROPIC_API_KEY || ''
  return new AnthropicProvider(key)
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd C:/Dev/iridology-app && npx tsc --noEmit 2>&1 | grep "src/lib/ai"
```

Expected: no output (no errors in the new files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/
git commit -m "feat: add AI provider abstraction (Anthropic + OpenAI)"
```

---

## Task 3: Wire analyze.ts, compare.ts, review.ts to use provider

> **Note on `chat.ts`:** `chat.ts` uses `anthropic.messages.stream()` which returns an `AsyncGenerator`. The `AIProvider` interface only covers request-response. `chat.ts` is **out of scope for this plan** — it will keep its Anthropic-specific implementation. It can be migrated later when OpenAI streaming is needed.

**Files:**
- Modify: `src/lib/claude/analyze.ts`
- Modify: `src/lib/claude/compare.ts`
- Modify: `src/lib/claude/review.ts`

The pattern is the same for all three. Replace `anthropic.messages.create(...)` with `provider.complete(...)`, where `provider = await getAIProvider()`. Pass `systemPrompt`, `userText`, and `images` through.

- [ ] **Step 1: Refactor `analyze.ts`**

At the top of `analyzeIris`, replace:
```typescript
// OLD — delete these imports and direct anthropic calls
import { anthropic } from './client'
```

Add at top:
```typescript
import { getAIProvider } from '@/lib/ai/get-provider'
```

Replace the first `anthropic.messages.create(...)` call (lines ~70–101) with:

```typescript
const provider = await getAIProvider()
const response = await provider.complete({
  systemPrompt: STANDARD_ANALYSIS_SYSTEM_PROMPT,
  userText: userPrompt,
  images: [
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
  ],
  maxTokens: 4096,
})

if (response.stopReason === 'max_tokens') {
  // retry with more tokens
  const retryResponse = await provider.complete({
    systemPrompt: STANDARD_ANALYSIS_SYSTEM_PROMPT,
    userText: userPrompt,
    images: [
      { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
      { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
    ],
    maxTokens: 6144,
  })

  if (retryResponse.stopReason === 'max_tokens') {
    return { code: 'response_too_long', message: 'Response still truncated after increasing token limit' }
  }

  const parseResult = await parseWithRetry(retryResponse.text)
  if ('code' in parseResult && parseResult.code === 'invalid_json') {
    const finalResponse = await provider.complete({
      systemPrompt: STANDARD_ANALYSIS_SYSTEM_PROMPT,
      userText: `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`,
      images: [
        { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
        { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
      ],
      maxTokens: 6144,
    })
    return await parseWithRetry(finalResponse.text, 2) as ReportContent | AnalysisError
  }
  return parseResult as ReportContent | AnalysisError
}

const parseResult = await parseWithRetry(response.text)
if ('code' in parseResult && parseResult.code === 'invalid_json') {
  const retryResponse = await provider.complete({
    systemPrompt: STANDARD_ANALYSIS_SYSTEM_PROMPT,
    userText: `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No additional text.`,
    images: [
      { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
      { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
    ],
    maxTokens: 4096,
  })
  return await parseWithRetry(retryResponse.text, 2) as ReportContent | AnalysisError
}

return parseResult as ReportContent | AnalysisError
```

Also replace the `anthropic.messages.create(...)` call inside the timeout catch block (around line 280). Replace lines 280–322 with:

```typescript
const retryResponse = await provider.complete({
  systemPrompt: STANDARD_ANALYSIS_SYSTEM_PROMPT,
  userText: userPrompt,
  images: [
    { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
    { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
  ],
  maxTokens: 4096,
})

const retryParseResult = await parseWithRetry(retryResponse.text)
return retryParseResult as ReportContent | AnalysisError
```

Note: `provider` must be declared before the `try` block so the catch can reference it:
```typescript
const provider = await getAIProvider()
try {
  // ... main logic
} catch (error) {
  // ... timeout retry uses provider
}
```

Remove the `import { anthropic } from './client'` line.

- [ ] **Step 2: Refactor `compare.ts` — same pattern, 4 images**

Read `compare.ts` first, then apply the same substitution: replace `anthropic.messages.create(...)` → `provider.complete(...)`.

**Important:** `compare.ts` passes **4 images** (2 previous + 2 current session). Pass all four in the `images` array:
```typescript
images: [
  { data: request.previousRightIrisBase64, mediaType: 'image/jpeg' },
  { data: request.previousLeftIrisBase64, mediaType: 'image/jpeg' },
  { data: request.rightIrisBase64, mediaType: 'image/jpeg' },
  { data: request.leftIrisBase64, mediaType: 'image/jpeg' },
],
```

- [ ] **Step 3: Refactor `review.ts` — same pattern**

Read `review.ts` first, then apply the same substitution.

- [ ] **Step 4: Verify build**

```bash
cd C:/Dev/iridology-app && npx next build 2>&1 | tail -10
```

Expected: Build passes, route table printed, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/claude/analyze.ts src/lib/claude/compare.ts src/lib/claude/review.ts
git commit -m "refactor: route AI calls through provider abstraction"
```

---

## Task 4: Settings API route

**Files:**
- Create: `src/app/api/settings/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/settings/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_KEYS = ['active_provider', 'anthropic_api_key', 'openai_api_key'] as const

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ALLOWED_KEYS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mask key values — return only last 4 chars
  const masked = (data ?? []).map((row) => ({
    key: row.key,
    value: row.key.endsWith('_key') && row.value
      ? '••••••••' + row.value.slice(-4)
      : row.value,
    hasValue: Boolean(row.value),
  }))

  return NextResponse.json(masked)
}

export async function POST(request: Request) {
  const body = await request.json()
  const updates: Array<{ key: string; value: string }> = []

  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      // Don't overwrite with masked value (user left field unchanged)
      if (typeof body[key] === 'string' && !body[key].startsWith('••••')) {
        updates.push({ key, value: body[key] })
      }
    }
  }

  if (updates.length === 0) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('settings')
    .upsert(updates.map((u) => ({ ...u, updated_at: new Date().toISOString() })), {
      onConflict: 'key',
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "api/settings"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/
git commit -m "feat: add settings GET/POST API route"
```

---

## Task 5: Settings UI

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/components/settings/provider-form.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create the client form component**

```tsx
// src/components/settings/provider-form.tsx
'use client'

import { useState } from 'react'

interface SettingRow {
  key: string
  value: string | null
  hasValue: boolean
}

export function ProviderForm({ initialSettings }: { initialSettings: SettingRow[] }) {
  const get = (key: string) => initialSettings.find((s) => s.key === key)

  const [activeProvider, setActiveProvider] = useState(
    get('active_provider')?.value ?? 'anthropic'
  )
  const [anthropicKey, setAnthropicKey] = useState(
    get('anthropic_api_key')?.value ?? ''
  )
  const [openaiKey, setOpenaiKey] = useState(
    get('openai_api_key')?.value ?? ''
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_provider: activeProvider,
        anthropic_api_key: anthropicKey,
        openai_api_key: openaiKey,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to save settings')
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-lg">
      {/* Active provider */}
      <div className="space-y-3">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          Active AI Provider
        </label>
        <div className="space-y-2">
          {(['anthropic', 'openai'] as const).map((p) => (
            <label key={p} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={activeProvider === p}
                onChange={() => setActiveProvider(p)}
                className="accent-teal-700"
              />
              <span className="text-sm font-medium capitalize">
                {p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT-4o)'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Anthropic key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          Anthropic API Key
        </label>
        <input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-api03-..."
          className="w-full px-3 py-2 border rounded-md text-sm font-mono"
          style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          autoComplete="off"
        />
        <p className="text-xs text-gray-400">Get yours at console.anthropic.com</p>
      </div>

      {/* OpenAI key */}
      <div className="space-y-2">
        <label className="block text-sm font-medium" style={{ color: 'oklch(0.3 0.06 175)' }}>
          OpenAI API Key
        </label>
        <input
          type="password"
          value={openaiKey}
          onChange={(e) => setOpenaiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full px-3 py-2 border rounded-md text-sm font-mono"
          style={{ borderColor: 'oklch(0.8 0.04 175)' }}
          autoComplete="off"
        />
        <p className="text-xs text-gray-400">Get yours at platform.openai.com</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: 'oklch(0.45 0.12 175)' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create the settings page (Server Component)**

```tsx
// src/app/(app)/settings/page.tsx
import { createAdminClient } from '@/lib/supabase/server'
import { ProviderForm } from '@/components/settings/provider-form'

export default async function SettingsPage() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['active_provider', 'anthropic_api_key', 'openai_api_key'])

  const settings = (data ?? []).map((row) => ({
    key: row.key,
    value: row.key.endsWith('_key') && row.value
      ? '••••••••' + row.value.slice(-4)
      : row.value,
    hasValue: Boolean(row.value),
  }))

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2" style={{ color: 'oklch(0.3 0.06 175)' }}>
        AI Provider Settings
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Choose which AI provider to use for iris analysis. Keys are stored securely in the database.
      </p>
      <ProviderForm initialSettings={settings} />
    </div>
  )
}
```

- [ ] **Step 3: Add Settings link to sidebar**

Read `src/components/layout/sidebar.tsx`, then add a Settings nav item at the bottom of the nav list:

```tsx
import { Settings } from 'lucide-react'
// ... existing imports

// Add to nav items array (after New Session, before end):
{ href: '/settings', label: 'Settings', icon: Settings }
```

- [ ] **Step 4: Build check**

```bash
cd C:/Dev/iridology-app && npx next build 2>&1 | tail -15
```

Expected: `/settings` appears in the route table, build passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/settings/ src/components/settings/ src/components/layout/sidebar.tsx
git commit -m "feat: add settings page for AI provider and API key management"
```

---

## Task 6: End-to-end smoke test + push

- [ ] **Step 1: Start dev server and open the app**

```bash
cd C:/Dev/iridology-app && npm run dev
```

Open `http://localhost:3000/settings` in the browser.

- [ ] **Step 2: Enter OpenAI key and set provider to OpenAI**

Enter the OpenAI API key (from `platform.openai.com/api-keys`) and select "OpenAI (GPT-4o)". Click Save Settings.

Expected: "Saved ✓" confirmation, no error.

- [ ] **Step 3: Create a test session and verify analysis completes**

Create a new session with a patient and upload iris images. Start analysis.

Expected: Analysis completes within ~60 seconds (GPT-4o is fast) and a report is generated.

- [ ] **Step 4: Switch back to Anthropic (optional)**

When Anthropic API key is available, enter it in settings, switch the provider, and verify analysis works.

- [ ] **Step 5: Push to GitHub**

```bash
git push origin master
```

---

## Notes

- API keys are stored as plain text in the `settings` table. Supabase encrypts data at rest. For this single-practitioner use case this is acceptable — the RLS policy ensures only authenticated users can read it.
- The `••••` masking is cosmetic UI only — the real value is always written on Save unless the user left the field unchanged (starts with `••••`).
- `process.env.ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in `.env.local` act as fallbacks if no key is saved in the DB — useful during local development.
- `src/lib/claude/client.ts` (the old singleton `anthropic` export) can be deleted once all four files are refactored, but is harmless to leave.
