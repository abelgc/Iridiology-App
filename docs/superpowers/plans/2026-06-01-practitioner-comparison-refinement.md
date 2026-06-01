# Practitioner & Comparison Mode Prompt Refinement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the three practitioner report prompts (Standard, Comparison, Technical Review) so iris anatomy supports clinical interpretation instead of replacing it, calibration favors functional over degenerative wording, comparison mode reports only meaningful change, and the dual-model synthesis never leaks "Analysis A/B" meta-commentary.

**Architecture:** This is a prompt-engineering change only. No runtime/control-flow changes. We edit the system-prompt string constants in `src/lib/claude/prompts.ts`, the two synthesis prompts in `compare.ts` and `analyze-dual.ts`, and the structural assertions in `prompts.test.ts`. The user chose **inline per report** (no shared constant) — each prompt carries its own copy of the discipline rules. Client reports are unaffected (separate pipeline in `src/lib/client/`).

**Tech Stack:** TypeScript, Next.js, Vitest. Prompts are plain template-literal strings.

**Verification reality:** Prompt behavior cannot be unit-tested deterministically. Tests here are *structural* (assert the guidance text is wired into each prompt). True quality verification is a **live run** of each report type against the GOOD/BAD examples in this plan (Task 8).

---

## Scope & Decisions (locked with user 2026-06-01)

- Apply anatomy + interpretation-hierarchy refinements to **all three** practitioner reports, including Standard (which currently forbids iris anatomy — this is a deliberate reversal).
- Rules written **inline per report**, not as a shared constant.
- Client reports (`src/lib/client/writing-pipeline.ts`) are out of scope and must not change.

---

## Shared Prompt Text (the exact text to inline)

These blocks are defined once here for accuracy. Each task says which block to inline and where. Inline the **full text** into each prompt (per the inline-per-report decision).

### BLOCK A — INTERPRETATION DISCIPLINE
```
INTERPRETATION DISCIPLINE:
The reader is the treating practitioner, who already knows iridology terminology — do not teach iridology theory inside the report. Iris anatomy must SUPPORT the interpretation, never replace it. Name iris structures (fibres, lacunae, the autonomic/nerve wreath, pigment, contraction rings, radial furrows, collarette patterns, transversal markings) only as evidence for a functional conclusion.

Every section follows this hierarchy:
1. Key iris observation (concise).
2. Functional interpretation.
3. Clinical implication.
4. Comparative evolution — only if relevant.

For every finding make explicit why it matters, what functional burden it suggests, and whether it is active, compensatory, stable, progressive, or chronic. Never write an anatomy-only sentence, list, or paragraph without interpretation.
GOOD: "The autonomic wreath shows marked irregularity and flowered openings, suggesting chronic autonomic dysregulation with reduced adaptive reserve."
BAD: "The autonomic wreath contains multiple lacunae, irregular openings, fibre separation, and radial asymmetry." (anatomy without interpretation)

CALIBRATION — default to functional, escalate only when iris evidence strongly supports it:
- Fibre looseness does not equal degeneration. Lacunae do not equal pathology. Pigment does not equal toxicity. Contraction rings do not equal trauma certainty. Transversal markings do not equal tissue collapse.
- Prefer functional dysregulation, congestion, chronic compensation, reduced resilience, adaptive overload, functional exhaustion, and regulatory inefficiency before escalating into degeneration, collapse, severe depletion, or irreversible weakness.
- Hepatic and metabolic: brown or orange pigment overlays that coexist with compression, congestion patterns, digestive history, biliary signs, or metabolic stagnation justify stronger hepatic-burden wording. Do not automatically conclude toxicity, poisoning, liver damage, or active pathology unless the iris strongly supports it.
- Nervous system: you may identify ANS irregularity, a flowered nerve wreath, tension rings, cranial-zone dysregulation, sensory-overload tendency, and reduced adaptive reserve, but distinguish functional dysregulation from chronic overload, compensation, and structural deterioration. Do not escalate to neurological pathology without strong iris evidence.
- Emotional field: emotional interpretations are supportive and contextual. If practitioner intake or patient history confirms emotional patterns, integrate them carefully. Do not present emotional conclusions as iris-confirmed facts unless the iris strongly supports them.

SECTION DISCIPLINE:
Keep each section concise and practitioner-focused — relevant iris observations only, clinically useful conclusions, minimal repetition. Avoid excessive narration of iris morphology.

AXIS LOGIC:
Axes describe interaction dynamics, regulatory relationships, compensatory loops, and systemic burden flow — never a repeat of the sections.
GOOD: "Hepatic congestion interacting with digestive dysregulation and lymphatic stagnation."
BAD: repeating the hepatic and digestive sections in axis format.

FINAL INTERNAL CHECK (before output):
Remove repetitive stagnation statements. Remove unnecessary morphology narration. Verify every strong claim is iris-supported. Verify the interpretation stays clinically useful. Ensure anatomy supports interpretation rather than replacing it. Keep the report balanced between over-pathologizing and excessive neutrality.
```

### BLOCK B — COMPARISON PRIORITY (comparison report only)
```
COMPARISON PRIORITY:
The purpose of comparison mode is NOT to rewrite the full report. Identify clinically meaningful change only. Prioritise, in this order: (1) what changed, (2) what worsened, (3) what improved, (4) what stabilized, (5) what became compensatory. Focus on newly appearing burdens, reduction of congestion, worsening depletion, improved regulation, structural stabilization, nervous-system adaptation, metabolic compensation, shifts in inflammatory or lymphatic patterns, dominant-axis evolution, and structural-versus-functional shifts.
Do not rewrite unchanged sections unnecessarily. If a section shows no meaningful structural or functional change, do not narrate it section by section, and do NOT repeat "stable", "stagnant", or "no change" in every section. State the absence of meaningful change ONCE, globally, in the conclusion.
If changes are subtle, say so briefly and continue. Do not inflate minimal visual differences into major progression.
```

### BLOCK C — SYNTHESIS HYGIENE (both synthesis prompts)
```
The reader is the practitioner and must NEVER see references to "Analysis A", "Analysis B", the model names, or any meta-commentary comparing the two source analyses. Never write phrases such as "Analysis B offered no contradiction". Produce one clean, integrated clinical report only.
```

### BLOCK D — STANDARD opening replacement (Standard report only)
Replace the current first paragraph (the "Never describe the iris…" paragraph) with:
```
You are a clinical iridology report writer for the treating practitioner, who already understands iridology terminology. Your job is to translate iris findings into functional, clinical body language. You MAY name the iris structures that support a finding — fibres, lacunae, the autonomic/nerve wreath, pigment, contraction rings, radial furrows, collarette patterns, and transversal markings — but iris anatomy must always SUPPORT a functional interpretation; it must never replace it or stand alone. Do not write anatomy-only sentences and do not teach iridology theory. Every finding must connect to which body system is affected, how it is functioning, and how it relates to the patient's symptoms. Write about metabolic processes, hormonal regulation, nervous system behavior, digestive function, and elimination pathways, grounded in the iris evidence that supports them.
```

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/lib/claude/prompts.ts` | The three practitioner system prompts | Standard: reverse anatomy ban (BLOCK D) + inline BLOCK A. Comparison: inline BLOCK A + BLOCK B. Technical Review: inline BLOCK A. Collapse the dead duplicate standard constant. |
| `src/lib/claude/compare.ts` | Comparison dual-model synthesis prompt | Inline BLOCK C + fold in BLOCK B delta-focus. |
| `src/lib/claude/analyze-dual.ts` | Standard dual-model synthesis prompt | Inline BLOCK C. |
| `src/lib/claude/__tests__/prompts.test.ts` | Structural assertions | Replace old "never describe iris" assertions; add assertions for the new guidance. |

**Note on the duplicate standard constant:** `STANDARD_ANALYSIS_SYSTEM_PROMPT` (line ~1) and `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` (line ~78) are near-identical. Only `_EN` is live (`getStandardAnalysisSystemPrompt` returns it; `analyze.ts` and `analyze-dual.ts` use that). Task 1 edits `_EN` and collapses the dead copy to `export const STANDARD_ANALYSIS_SYSTEM_PROMPT = STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` to kill the divergence permanently.

---

## Task 1: Standard analysis prompt — allow supporting anatomy + interpretation discipline

**Files:**
- Modify: `src/lib/claude/prompts.ts` (constant `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`, ~line 78; and collapse `STANDARD_ANALYSIS_SYSTEM_PROMPT`, ~line 1)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Update the structural test first (red).** In `prompts.test.ts`, in the `describe('STANDARD_ANALYSIS_SYSTEM_PROMPT'…)` block, DELETE the two assertions that encode the old behavior:
  - the `it('should contain body-first clinical writing directives'…)` assertion `expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('Never describe the iris')`
  - the entire `it('should prohibit iris anatomy language'…)` test (asserts `'Never mention fibers'`, `'collarette'`, `'peripupillary zones'`).
  Then ADD a new test:
```ts
it('allows iris anatomy that supports interpretation', () => {
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('anatomy must always SUPPORT')
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).not.toContain('Never describe the iris')
})
```

- [ ] **Step 2: Run the test to confirm it fails.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "allows iris anatomy"`. Expected: FAIL (prompt still says "Never describe the iris").

- [ ] **Step 3: Edit the prompt.** In `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`:
  1. Replace the entire opening paragraph (from "You are a clinical iridology report writer." through "…it does not belong in the report.") with **BLOCK D**.
  2. Immediately after BLOCK D, insert a blank line and **BLOCK A** (INTERPRETATION DISCIPLINE).
  3. In the existing `FINAL CHECK:` paragraph, leave it (BLOCK A already adds FINAL INTERNAL CHECK; both can coexist).

- [ ] **Step 4: Collapse the dead duplicate.** Replace the whole `export const STANDARD_ANALYSIS_SYSTEM_PROMPT = \`…\`` (the non-`_EN` constant) with:
```ts
export const STANDARD_ANALYSIS_SYSTEM_PROMPT = STANDARD_ANALYSIS_SYSTEM_PROMPT_EN
```
  (Define `_EN` above this line so the reference resolves. If ordering is awkward, move the `_EN` definition above the alias.)

- [ ] **Step 5: Run tests.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts`. Expected: PASS. Fix any other STANDARD assertions that referenced removed text (e.g. section-name/JSON tests still pass because that text is unchanged).

- [ ] **Step 6: Typecheck.** Run: `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors in `prompts.ts`.

- [ ] **Step 7: Commit.**
```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "refine(prompts): standard report allows supporting iris anatomy + interpretation discipline"
```

---

## Task 2: Comparison prompt — interpretation discipline + comparison priority

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`COMPARISON_ANALYSIS_SYSTEM_PROMPT`, ~line 155)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the test first (red).** In the `describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT'…)` block add:
```ts
it('contains interpretation discipline and comparison priority', () => {
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COMPARISON PRIORITY')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('do NOT repeat')
})
```

- [ ] **Step 2: Run to confirm it fails.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "comparison priority"`. Expected: FAIL.

- [ ] **Step 3: Edit the prompt.** In `COMPARISON_ANALYSIS_SYSTEM_PROMPT`, after the existing `COMPARATIVE ANALYSIS:` block (the numbered 6/7/8 lines) and before `RESPONSE FORMAT:`, insert **BLOCK A** then **BLOCK B**, each preceded by a blank line.

- [ ] **Step 4: Run tests.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "refine(prompts): comparison report focuses on meaningful change + interpretation discipline"
```

---

## Task 3: Technical review prompt — interpretation discipline

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`TECHNICAL_REVIEW_SYSTEM_PROMPT`, ~line 203)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the test first (red).** In the `describe('TECHNICAL_REVIEW_SYSTEM_PROMPT'…)` block add:
```ts
it('contains interpretation discipline', () => {
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('anatomy must SUPPORT the interpretation')
})
```

- [ ] **Step 2: Run to confirm it fails.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "interpretation discipline"`. Expected: FAIL for the technical-review case.

- [ ] **Step 3: Edit the prompt.** In `TECHNICAL_REVIEW_SYSTEM_PROMPT`, after the `INTERPRETATION RULES:` block (the numbered 1–5 lines) and before `PRIOR PRACTITIONER CORRECTIONS:`, insert **BLOCK A** preceded by a blank line.

- [ ] **Step 4: Run tests.** Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "refine(prompts): technical review adds interpretation discipline"
```

---

## Task 4: Comparison synthesis — no A/B leak + delta focus

**Files:**
- Modify: `src/lib/claude/compare.ts` (the `synthesisPrompt` template string in the dual-provider path)
- Test: `src/lib/claude/__tests__/compare-synthesis.test.ts` (new)

- [ ] **Step 1: Write the failing test.** Create `src/lib/claude/__tests__/compare-synthesis.test.ts`. The synthesis text is currently a local `const` inside `compareIris`, not exported. Export the static instruction portion as a named constant `COMPARISON_SYNTHESIS_INSTRUCTIONS` from `compare.ts` so it is testable, then:
```ts
/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import { COMPARISON_SYNTHESIS_INSTRUCTIONS } from '../compare'

describe('COMPARISON_SYNTHESIS_INSTRUCTIONS', () => {
  it('forbids leaking Analysis A/B meta-commentary and prioritises change', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('must NEVER see references to "Analysis A"')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('offered no contradiction')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('what changed')
  })
})
```

- [ ] **Step 2: Run to confirm it fails.** Run: `npx vitest run src/lib/claude/__tests__/compare-synthesis.test.ts`. Expected: FAIL (constant not exported).

- [ ] **Step 3: Refactor + edit.** In `compare.ts`, extract the static synthesis instruction text into a module-level `export const COMPARISON_SYNTHESIS_INSTRUCTIONS = \`…\``. Append **BLOCK C** and the delta-priority lines from **BLOCK B** to it. The runtime `synthesisPrompt` becomes the two analyses interpolated plus `${COMPARISON_SYNTHESIS_INSTRUCTIONS}`. Keep behavior identical otherwise.

- [ ] **Step 4: Run tests + typecheck.** Run: `npx vitest run src/lib/claude/__tests__/compare-synthesis.test.ts` (PASS) and `npx tsc --noEmit -p tsconfig.json` (no new errors).

- [ ] **Step 5: Commit.**
```bash
git add src/lib/claude/compare.ts src/lib/claude/__tests__/compare-synthesis.test.ts
git commit -m "refine(compare): synthesis hides Analysis A/B and prioritises meaningful change"
```

---

## Task 5: Standard synthesis — no A/B leak

**Files:**
- Modify: `src/lib/claude/analyze-dual.ts` (the `synthesisPrompt` template, ~line 73)

- [ ] **Step 1: Edit.** Append **BLOCK C** to the `=== SYNTHESIS INSTRUCTIONS ===` section of the `synthesisPrompt` in `analyze-dual.ts` (after the existing numbered instructions, before the closing backtick).

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.

- [ ] **Step 3: Commit.**
```bash
git add src/lib/claude/analyze-dual.ts
git commit -m "refine(analyze-dual): synthesis hides Analysis A/B meta-commentary"
```

---

## Task 6: Full test + lint gate

- [ ] **Step 1: Run the full prompt test suite.** Run: `npx vitest run src/lib/claude/__tests__/`. Expected: all PASS. If any legacy STANDARD assertion still references removed text, update it to the new wording.

- [ ] **Step 2: Typecheck the whole project.** Run: `npx tsc --noEmit -p tsconfig.json`. Expected: no new non-test errors (pre-existing `__tests__` vitest-globals errors are unrelated).

- [ ] **Step 3: Commit if anything changed.**
```bash
git add -A src/lib/claude
git commit -m "test(prompts): align structural assertions with refined prompts"
```

---

## Task 7: Deploy

- [ ] **Step 1: Push + deploy to production** (user runs these live per their workflow):
```bash
git push origin master
vercel deploy --prod --yes
```
- [ ] **Step 2: Confirm `readyState: READY`** in the deploy output.

---

## Task 8: Live verification (manual — the real quality check)

Prompts cannot be unit-verified. Generate one of each report type on production and check against the spec.

- [ ] **Step 1: Run a Standard analysis.** Confirm: it now names iris structures, but every anatomy mention is followed by functional interpretation (no anatomy-only sentences). Compare a section against the BLOCK A GOOD/BAD examples.
- [ ] **Step 2: Run a Comparison.** Confirm: sections without change are NOT individually narrated; "stable/no change" is not repeated per section; the conclusion states the absence of meaningful change once; no "Analysis A/B" text appears anywhere.
- [ ] **Step 3: Run a Technical Review.** Confirm: anatomy supports interpretation; calibration favors functional wording; no "Analysis A/B" leak.
- [ ] **Step 4: Verify via Supabase** that each session reached `completed` with a report, and durations stayed under the ~290s guard.
- [ ] **Step 5: Spot-check calibration.** Confirm the report does not escalate to degeneration/toxicity/neurological-pathology without strong stated iris evidence (BLOCK A calibration).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Anatomy may be included, must support interpretation → BLOCK D (Standard) + BLOCK A (all three). ✓
- 4-step section hierarchy → BLOCK A. ✓
- No anatomy-only paragraphs; state active/compensatory/stable/progressive/chronic → BLOCK A. ✓
- Comparison priority / don't rewrite unchanged / don't repeat "stable" / state once globally → BLOCK B (Task 2) + folded into synthesis (Task 4). ✓
- Comparative interpretation focus list → BLOCK B. ✓
- Structural-vs-functional calibration (the `≠` list) → BLOCK A CALIBRATION. ✓
- Hepatic/metabolic calibration → BLOCK A. ✓
- Nervous system calibration → BLOCK A. ✓
- Emotional field calibration → BLOCK A. ✓
- Section discipline / don't teach theory → BLOCK A. ✓
- Axis logic (interaction, not repetition) → BLOCK A. ✓
- Final internal check → BLOCK A FINAL INTERNAL CHECK. ✓
- "Analysis B offered no contradiction" leak → BLOCK C (Tasks 4 & 5). ✓

**Placeholder scan:** none — all inlined text is in the Shared Prompt Text section.

**Consistency:** test constant names (`COMPARISON_SYNTHESIS_INSTRUCTIONS`) match between Task 4 step 1 and step 3. Standard edits target the live `_EN` constant; the dead copy is aliased to it.

**Open risk:** the Standard prompt still contains legacy `SEVERITY CALIBRATION`, `STRUCTURAL VS FUNCTIONAL`, and `FINAL CHECK` sections that overlap BLOCK A. They are compatible (additive), but during Task 1 review, confirm no direct contradiction with BLOCK D (e.g. no leftover "Never mention fibers" elsewhere in the constant). Grep the constant for "Never describe" / "Never mention fibers" after editing and remove any leftover.
```bash
grep -n "Never describe the iris\|Never mention fibers" src/lib/claude/prompts.ts   # expect: no matches
```
