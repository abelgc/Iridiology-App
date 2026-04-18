# Jyotish Astrology Emotional Field Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional astrological fields (birth place, time) to patient creation; post-analysis, enhance emotional field with Jyotish chakra and emotion recommendation when all fields present.

**Architecture:** Store astrological fields (country_of_birth, city_of_birth, time_of_day) as optional patient attributes. After iris analysis completes, check if all four fields are filled; if so, call Claude with Jyotish prompt to enhance the emotional_field section only, blending chakra/emotion recommendation seamlessly into existing text.

**Tech Stack:** Next.js API routes, Zod validation, Supabase, Claude API

---

## File Structure

**Files to create:**
- `src/lib/claude/enhance-emotional-field.ts` — Function to enhance emotional field with Jyotish recommendation
- `src/lib/claude/prompts.ts` — Add JYOTISH_ENHANCEMENT_SYSTEM_PROMPT
- `src/lib/claude/__tests__/enhance-emotional-field.test.ts` — Tests for enhancement function

**Files to modify:**
- `src/lib/validators/patient.ts` — Add three optional astrological fields to schema
- `src/components/patients/patient-form.tsx` — Add form fields for astrological data
- `src/app/api/analyze/route.ts` — Call enhancement after analysis if fields present
- `src/types/claude.ts` — Extend AnalysisRequest to include astrological fields

---

## Task Breakdown

### Task 1: Extend Patient Schema

**Files:**
- Modify: `src/lib/validators/patient.ts`

- [ ] **Step 1: Read the current patient schema**

```bash
cat src/lib/validators/patient.ts
```

- [ ] **Step 2: Add three new optional fields to patientCreateSchema**

Replace the schema definition to add these fields after `date_of_birth`:

```typescript
export const patientCreateSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(255),
  date_of_birth: z.string().optional().nullable(),
  country_of_birth: z.string().optional().nullable(),
  city_of_birth: z.string().optional().nullable(),
  time_of_day: z.enum(['morning', 'evening']).optional().nullable(),
  gender: z.string().optional().nullable(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  general_history: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})
```

- [ ] **Step 3: Verify types are exported correctly**

Ensure `PatientCreateInput` and `PatientUpdateInput` types are still correctly inferred and exported (no code change needed, just verify the types still work).

- [ ] **Step 4: Commit**

```bash
git add src/lib/validators/patient.ts
git commit -m "feat: add optional astrological fields to patient schema"
```

---

### Task 2: Add Jyotish Enhancement System Prompt

**Files:**
- Modify: `src/lib/claude/prompts.ts`

- [ ] **Step 1: Open the prompts file and find the end**

```bash
tail -20 src/lib/claude/prompts.ts
```

- [ ] **Step 2: Add JYOTISH_ENHANCEMENT_SYSTEM_PROMPT to the end of the file**

Append this prompt after the existing prompts:

```typescript
export const JYOTISH_ENHANCEMENT_SYSTEM_PROMPT = `You are a Jyotish (Vedic Astrology) expert enhancing an iridology report's emotional field section.

Your role: Based on the patient's birth data (date, place, time), recommend the primary chakra and main emotion to work on for healing.

INSTRUCTIONS:
1. Analyze the birth chart using standard Jyotish methods based on date, place, and time (morning/evening approximation).
2. Identify the primary imbalance or life lesson indicated by the chart.
3. Recommend ONE primary chakra to focus on and ONE main emotion/quality to cultivate.
4. Your response will be woven into existing iridology findings — it should complement, not replace them.

RESPONSE FORMAT:
Respond with ONLY a valid JSON object (no additional text):
{
  "chakra": "Root Chakra" or "Sacral Chakra" or "Solar Plexus Chakra" or "Heart Chakra" or "Throat Chakra" or "Third Eye Chakra" or "Crown Chakra",
  "emotion": "A brief emotion or quality to cultivate (e.g., 'stability and grounding', 'creative flow', 'authentic expression')",
  "reasoning": "A one-sentence explanation of why this chakra based on the birth chart"
}

Be specific and direct. Avoid generic advice. The emotion should be actionable and healing-focused.`
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude/prompts.ts
git commit -m "feat: add Jyotish enhancement system prompt"
```

---

### Task 3: Create enhance-emotional-field Function

**Files:**
- Create: `src/lib/claude/enhance-emotional-field.ts`

- [ ] **Step 1: Create the file with implementation**

```bash
cat > src/lib/claude/enhance-emotional-field.ts << 'EOF'
import { getAIProvider } from '@/lib/ai/get-provider'
import { JYOTISH_ENHANCEMENT_SYSTEM_PROMPT } from './prompts'
import { ReportContent, ReportSectionKey } from '@/types/report'

export interface JyotishEnhancementData {
  date_of_birth: string
  country_of_birth: string
  city_of_birth: string
  time_of_day: 'morning' | 'evening'
}

interface JyotishResponse {
  chakra: string
  emotion: string
  reasoning: string
}

export async function enhanceEmotionalFieldWithJyotish(
  reportContent: ReportContent,
  patientName: string,
  astrologyData: JyotishEnhancementData,
): Promise<ReportContent> {
  const provider = await getAIProvider()

  const userPrompt = `Patient: ${patientName}
Date of Birth: ${astrologyData.date_of_birth}
Place of Birth: ${astrologyData.city_of_birth}, ${astrologyData.country_of_birth}
Time of Birth: ${astrologyData.time_of_day}

Current Emotional Field Assessment:
${reportContent.section_2_emotional_field}

Please enhance this emotional field assessment by adding Jyotish astrological guidance on the primary chakra to work with and the main emotion to cultivate for healing. Blend it seamlessly into the existing text.`

  try {
    const response = await provider.complete({
      systemPrompt: JYOTISH_ENHANCEMENT_SYSTEM_PROMPT,
      userText: userPrompt,
      images: [],
      maxTokens: 1024,
    })

    let jyotishData: JyotishResponse
    try {
      jyotishData = JSON.parse(response.text)
    } catch {
      console.error('[enhanceEmotionalField] Failed to parse Jyotish response:', response.text)
      return reportContent // Return unchanged if parsing fails
    }

    // Create enhancement prompt to blend the recommendation into the emotional field
    const blendingPrompt = `You are a clinical iridology report writer. You have:

1. An existing emotional field assessment from iridology
2. A Jyotish recommendation for chakra and emotion work

Your task: Enhance the emotional field assessment by naturally incorporating the Jyotish recommendation (chakra and emotion) into a single flowing paragraph. The recommendation should feel like a natural continuation of the iridological findings, not a separate section.

Existing Assessment:
${reportContent.section_2_emotional_field}

Jyotish Recommendation:
Chakra: ${jyotishData.chakra}
Emotion to Cultivate: ${jyotishData.emotion}
Reasoning: ${jyotishData.reasoning}

Write the enhanced emotional field assessment as a single paragraph that seamlessly incorporates both the iridological findings and the astrological guidance. Do NOT use bullet points. Do NOT use headers. Write naturally flowing prose.`

    const blendingSystemPrompt = `You are an expert clinical writer enhancing iridology reports. Integrate astrological insights seamlessly into clinical text without breaking narrative flow.`

    const blendedResponse = await provider.complete({
      systemPrompt: blendingSystemPrompt,
      userText: blendingPrompt,
      images: [],
      maxTokens: 1024,
    })

    // Return report with enhanced emotional field
    return {
      ...reportContent,
      section_2_emotional_field: blendedResponse.text,
    }
  } catch (error) {
    console.error('[enhanceEmotionalField] Error:', error)
    return reportContent // Return unchanged if enhancement fails
  }
}

export function shouldEnhanceWithJyotish(data: any): data is JyotishEnhancementData {
  return (
    data?.date_of_birth &&
    data?.country_of_birth &&
    data?.city_of_birth &&
    (data?.time_of_day === 'morning' || data?.time_of_day === 'evening')
  )
}
EOF
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/claude/enhance-emotional-field.ts
git commit -m "feat: create Jyotish emotional field enhancement function"
```

---

### Task 4: Write Tests for Enhancement Function

**Files:**
- Create: `src/lib/claude/__tests__/enhance-emotional-field.test.ts`

- [ ] **Step 1: Create test file**

```bash
cat > src/lib/claude/__tests__/enhance-emotional-field.test.ts << 'EOF'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enhanceEmotionalFieldWithJyotish, shouldEnhanceWithJyotish } from '../enhance-emotional-field'
import * as getProvider from '@/lib/ai/get-provider'
import { ReportContent } from '@/types/report'

vi.mock('@/lib/ai/get-provider')

describe('shouldEnhanceWithJyotish', () => {
  it('returns true when all four astrological fields are present', () => {
    const data = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'morning',
    }
    expect(shouldEnhanceWithJyotish(data)).toBe(true)
  })

  it('returns false when any field is missing', () => {
    const data = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      // time_of_day is missing
    }
    expect(shouldEnhanceWithJyotish(data)).toBe(false)
  })

  it('returns false when date_of_birth is missing', () => {
    const data = {
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'morning',
    }
    expect(shouldEnhanceWithJyotish(data)).toBe(false)
  })

  it('returns false when time_of_day is invalid', () => {
    const data = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'afternoon', // invalid
    }
    expect(shouldEnhanceWithJyotish(data)).toBe(false)
  })

  it('accepts "evening" as valid time_of_day', () => {
    const data = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'evening',
    }
    expect(shouldEnhanceWithJyotish(data)).toBe(true)
  })
})

describe('enhanceEmotionalFieldWithJyotish', () => {
  const mockReport: ReportContent = {
    section_1_general_terrain: 'Terrain description',
    section_2_emotional_field: 'Original emotional field assessment based on iris patterns.',
    section_3_cognitive_nervous: 'Cognitive assessment',
    section_4_immune_lymphatic: 'Immune assessment',
    section_5_endocrine_hormonal: 'Endocrine assessment',
    section_6_circulatory_cardiorespiratory: 'Circulatory assessment',
    section_7_hepatic: 'Hepatic assessment',
    section_8_digestive_intestinal: 'Digestive assessment',
    section_9_renal_urinary: 'Renal assessment',
    section_10_structural_integumentary: 'Structural assessment',
    section_11_detected_axes: 'Axis: liver and digestion',
    section_12_conclusion: 'Conclusion',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns enhanced report with modified emotional field', async () => {
    const mockProvider = {
      complete: vi.fn()
        .mockResolvedValueOnce({
          text: JSON.stringify({
            chakra: 'Heart Chakra',
            emotion: 'emotional openness and trust',
            reasoning: 'Venus indicates need for emotional expression',
          }),
        })
        .mockResolvedValueOnce({
          text: 'Enhanced emotional field assessment incorporating Heart Chakra work.',
        }),
    }

    vi.mocked(getProvider.getAIProvider).mockResolvedValue(mockProvider)

    const astrologyData = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'morning' as const,
    }

    const result = await enhanceEmotionalFieldWithJyotish(mockReport, 'John Doe', astrologyData)

    expect(result.section_2_emotional_field).toBe('Enhanced emotional field assessment incorporating Heart Chakra work.')
    expect(result.section_1_general_terrain).toBe(mockReport.section_1_general_terrain) // Other sections unchanged
    expect(mockProvider.complete).toHaveBeenCalledTimes(2)
  })

  it('returns original report if Jyotish JSON parsing fails', async () => {
    const mockProvider = {
      complete: vi.fn().mockResolvedValueOnce({
        text: 'Not valid JSON',
      }),
    }

    vi.mocked(getProvider.getAIProvider).mockResolvedValue(mockProvider)

    const astrologyData = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'morning' as const,
    }

    const result = await enhanceEmotionalFieldWithJyotish(mockReport, 'John Doe', astrologyData)

    expect(result).toEqual(mockReport) // Unchanged
  })

  it('returns original report if provider call fails', async () => {
    const mockProvider = {
      complete: vi.fn().mockRejectedValue(new Error('API error')),
    }

    vi.mocked(getProvider.getAIProvider).mockResolvedValue(mockProvider)

    const astrologyData = {
      date_of_birth: '1990-01-15',
      country_of_birth: 'India',
      city_of_birth: 'Mumbai',
      time_of_day: 'morning' as const,
    }

    const result = await enhanceEmotionalFieldWithJyotish(mockReport, 'John Doe', astrologyData)

    expect(result).toEqual(mockReport) // Unchanged
  })
})
EOF
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test -- src/lib/claude/__tests__/enhance-emotional-field.test.ts
```

Expected output: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude/__tests__/enhance-emotional-field.test.ts
git commit -m "test: add tests for Jyotish emotional field enhancement"
```

---

### Task 5: Extend AnalysisRequest Type

**Files:**
- Modify: `src/types/claude.ts`

- [ ] **Step 1: Read the current AnalysisRequest type**

```bash
cat src/types/claude.ts
```

- [ ] **Step 2: Update AnalysisRequest to include astrological fields**

The patientData object in AnalysisRequest should now include the new optional fields. If it uses PatientCreateInput, it will automatically include them. Verify the type is correct:

```typescript
// AnalysisRequest should have:
patientData: PatientCreateInput // or explicit object type that includes astrological fields
```

If AnalysisRequest defines patientData inline, extend it to include:
- `country_of_birth?: string | null`
- `city_of_birth?: string | null`
- `time_of_day?: 'morning' | 'evening' | null`

- [ ] **Step 3: Verify no breaking changes**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add src/types/claude.ts
git commit -m "feat: extend AnalysisRequest to include astrological fields"
```

---

### Task 6: Update Patient Form Component

**Files:**
- Modify: `src/components/patients/patient-form.tsx`

- [ ] **Step 1: Read the current patient form**

```bash
cat src/components/patients/patient-form.tsx
```

- [ ] **Step 2: Add three form fields for astrological data**

Find where `date_of_birth` is rendered and add these fields after it. Use the same form library/pattern:

```typescript
// After date_of_birth field, add:

{/* Astrological fields (optional) */}
<FormField
  control={form.control}
  name="country_of_birth"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Country of Birth (optional)</FormLabel>
      <FormControl>
        <Input placeholder="e.g., India" {...field} />
      </FormControl>
    </FormItem>
  )}
/>

<FormField
  control={form.control}
  name="city_of_birth"
  render={({ field }) => (
    <FormItem>
      <FormLabel>City of Birth (optional)</FormLabel>
      <FormControl>
        <Input placeholder="e.g., Mumbai" {...field} />
      </FormControl>
    </FormItem>
  )}
/>

<FormField
  control={form.control}
  name="time_of_day"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Time of Birth (optional)</FormLabel>
      <FormControl>
        <Select value={field.value || ''} onValueChange={field.onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="morning">Morning</SelectItem>
            <SelectItem value="evening">Evening</SelectItem>
          </SelectContent>
        </Select>
      </FormControl>
    </FormItem>
  )}
/>
```

- [ ] **Step 3: Run lint to check for errors**

```bash
npm run lint -- src/components/patients/patient-form.tsx
```

- [ ] **Step 4: Commit**

```bash
git add src/components/patients/patient-form.tsx
git commit -m "feat: add astrological fields to patient form"
```

---

### Task 7: Integrate Enhancement into Analyze Route

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Read the current analyze route**

```bash
cat src/app/api/analyze/route.ts
```

- [ ] **Step 2: Import the new functions at the top**

Add these imports after existing imports:

```typescript
import { enhanceEmotionalFieldWithJyotish, shouldEnhanceWithJyotish } from '@/lib/claude/enhance-emotional-field'
```

- [ ] **Step 3: Modify the runAnalysis function to call enhancement**

Find this section in the code (around line 47-49):

```typescript
const { error: reportError } = await bg
  .from('reports')
  .insert({ session_id: sessionId, report_content: result, report_version: 1, is_edited: false })
```

Replace it with:

```typescript
let finalReport = result

// Enhance emotional field with Jyotish if all astrological fields present
if (shouldEnhanceWithJyotish(patientData)) {
  console.log(`[analyze] session ${sessionId} — enhancing emotional field with Jyotish...`)
  finalReport = await enhanceEmotionalFieldWithJyotish(
    result,
    patientData.full_name,
    {
      date_of_birth: patientData.date_of_birth!,
      country_of_birth: patientData.country_of_birth!,
      city_of_birth: patientData.city_of_birth!,
      time_of_day: patientData.time_of_day as 'morning' | 'evening',
    },
  )
  console.log(`[analyze] session ${sessionId} — emotional field enhanced ✓`)
}

const { error: reportError } = await bg
  .from('reports')
  .insert({ session_id: sessionId, report_content: finalReport, report_version: 1, is_edited: false })
```

- [ ] **Step 4: Run lint**

```bash
npm run lint -- src/app/api/analyze/route.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat: integrate Jyotish emotional field enhancement into analyze endpoint"
```

---

### Task 8: Manual Testing

**Test the full flow:**

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create a new patient WITHOUT astrological fields**

1. Navigate to "New Patient" page
2. Fill in: Name, Date of Birth, Gender, optional other fields
3. Leave Country of Birth, City of Birth, and Time of Birth empty
4. Save patient
5. Verify patient is created successfully

- [ ] **Step 3: Create another new patient WITH all astrological fields**

1. Navigate to "New Patient" page
2. Fill in: Name (e.g., "Test Patient"), Date of Birth (e.g., 1990-01-15)
3. Fill in: Country of Birth (e.g., "India"), City of Birth (e.g., "Mumbai"), Time of Birth (select "morning" or "evening")
4. Save patient
5. Verify patient is created successfully

- [ ] **Step 4: Create a session for the second patient and analyze iris images**

1. Go to patient's page
2. Start a new session
3. Upload iris images (or use test images if available)
4. Submit analysis
5. Wait for analysis to complete
6. View the report
7. **Verify:** The emotional field section (Section 2) should include chakra and emotion recommendation from Jyotish

- [ ] **Step 5: Create a session for the first patient (no astrological data) and analyze**

1. Go to first patient's page
2. Start a new session
3. Upload iris images
4. Submit analysis
5. Wait for analysis to complete
6. View the report
7. **Verify:** The emotional field section should contain only iridology findings (no Jyotish enhancement)

- [ ] **Step 6: Check logs for enhancement messages**

```bash
# In terminal where dev server is running, look for:
# "[analyze] session <id> — enhancing emotional field with Jyotish..."
# "[analyze] session <id> — emotional field enhanced ✓"
```

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ Optional astrological fields (country, city, morning/evening) added to patient
- ✅ Form fields visible but understated
- ✅ Jyotish analysis uses Claude's knowledge
- ✅ Enhancement called post-analysis if all fields filled
- ✅ Chakra + emotion blended naturally into emotional field prose
- ✅ No bullet points or explicit "astrology" labeling

**Placeholder Scan:**
- ✅ No TBD, TODO, or "implement later" patterns
- ✅ All code shown in full
- ✅ All commands are exact with expected outputs
- ✅ No "similar to Task X" references

**Type Consistency:**
- ✅ `time_of_day` uses `'morning' | 'evening'` enum consistently
- ✅ Function signatures match across `enhance-emotional-field.ts`, tests, and analyze route
- ✅ `JyotishEnhancementData` type used consistently

**Completeness:**
- ✅ Tests cover success, parsing failure, and API failure cases
- ✅ Error handling returns original report gracefully
- ✅ Validation function `shouldEnhanceWithJyotish` prevents partial calls
- ✅ Logging added for debugging enhancement flow

---

Plan complete and saved to `docs/superpowers/plans/2026-04-18-jyotish-emotional-field.md`. 

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task with review between tasks for fast iteration

**2. Inline Execution** — Execute tasks in this session with checkpoints for review

Which approach?
