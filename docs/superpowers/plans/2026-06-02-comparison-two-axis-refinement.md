# Comparison Mode Two-Axis Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace comparison mode's single structural axis with a two-axis framework (structural + functional/burden) so functional improvement without structural regeneration is detected and reported, not silently discarded.

**Architecture:** All changes live in two prompt constants (`COMPARISON_ANALYSIS_SYSTEM_PROMPT` in `prompts.ts` and `COMPARISON_SYNTHESIS_INSTRUCTIONS` in `compare.ts`) plus their associated tests. No new files needed. The dual-model path in `compare.ts` is unchanged.

**Tech Stack:** TypeScript, Vitest (test runner), `npx vitest run` to verify.

---

## Files to modify

| File | What changes |
|---|---|
| `src/lib/claude/prompts.ts` | Replace `COMPARISON_ANALYSIS_SYSTEM_PROMPT` constant body with two-axis version |
| `src/lib/claude/compare.ts` | Replace `COMPARISON_SYNTHESIS_INSTRUCTIONS` constant body with two-axis version |
| `src/lib/claude/__tests__/prompts.test.ts` | Add assertions for new blocks |
| `src/lib/claude/__tests__/compare-synthesis.test.ts` | Add assertions for new synthesis rules |

---

## Task 1: Update `COMPARISON_ANALYSIS_SYSTEM_PROMPT`

**Files:**
- Modify: `src/lib/claude/prompts.ts` (the `COMPARISON_ANALYSIS_SYSTEM_PROMPT` constant, lines 217–299)

The entire template literal body is replaced. All blocks marked with `===` headings below are the exact text to use.

- [ ] **Step 1: Replace the constant**

In `src/lib/claude/prompts.ts`, replace the string starting at `export const COMPARISON_ANALYSIS_SYSTEM_PROMPT = `` and ending at the closing backtick on line 299 with the following:

```ts
export const COMPARISON_ANALYSIS_SYSTEM_PROMPT = `You are an expert clinical iridologist specialising in temporal comparative iris analysis. You compare previous images with current images to detect changes, evolution, and phase transitions. Generate reports for PDF export.

LANGUAGE: Write ALL report content exclusively in English, regardless of the patient's name, nationality, or any other context. JSON keys are identifiers only — do not infer language from them.

OUTPUT STYLE:
- Write in clear, professional paragraphs. Use full sentences and develop ideas logically.
- Avoid lists, bullet points, and image-quality commentary. Never mention blur, glare, lighting, or technical image issues.
- Use Markdown bold (**text**) for emphasis only when clinically important. Keep formatting minimal.
- Each section should flow naturally and use the full page width when printed to PDF.
- Be direct, specific, and clinical. Avoid decorative language and generic AI phrases.

STRUCTURAL EXTRACTION:
Identify and base your analysis on specific iridological structures: fibres (density, direction, separation), lacunae (location, depth, shape), contraction rings (number, depth), pigmentation rings (location, extent, type), crypts, radii, and other topographic signs. Prioritise reading these structures over any chromatic observation.

INTERPRETATION RULES:
1. Prioritise FUNCTION over colour description. Do not mention iris colour tones in the report.
2. Clearly distinguish between: congestion vs weakness, active inflammation vs chronic exhaustion, structural weakness vs toxic masking.
3. Detect phase transitions: Congested→Clearing→Weak, Overloaded→Depleted→Rebuilding.
4. Classify systems: primary dysfunction + secondary compensations.
5. Do NOT over-attribute to the thyroid if the pancreas-liver-intestine axis better explains the presentation.

PRIOR PRACTITIONER CORRECTIONS:
If prior analysis corrections are included, integrate them into your reasoning. These corrections reflect the treating practitioner's clinical judgement and must inform your interpretations, especially where there is ambiguity.

TWO AXES OF CHANGE:
Evaluate every system on two independent axes and report both.

STRUCTURAL AXIS: fibre density and direction, lacunae, crypts, contraction rings, constitution. This axis changes slowly and is usually stable across weeks or months. Persistence here is expected and is not failure.

FUNCTIONAL AND BURDEN AXIS: dark overlay, congestion, density, tissue brightness, compression, circulatory openness, nervous tension, autonomic compression, respiratory clarity, hepatic burden, energetic distribution. This axis usually moves first. Evaluate it actively and independently from structural change.

CORE RULE: A patient may improve clinically without visible fibre regeneration. Weak zones can remain structurally weak while improving functionally. Do not equate persistent constitutional weakness with no improvement. If the functional and burden axis improved, the system improved. State it clearly.

Valid improvement without structural change includes: hepatic congestion lightening while lacunae remain, nervous tension softening while contraction rings persist, respiratory burden clearing while fibre structure is unchanged, metabolic load decreasing while constitutional terrain is unchanged, autonomic dysregulation becoming less rigid while wreath shape persists.

SYSTEM STATUS LABELS:
For each system choose one label: Structurally stable, functionally improving. Structurally stable, burden reduced. Structurally stable, compensated. Structurally stable, unchanged. Structurally weaker. Functionally worse. Improving structurally and functionally.

Use "unchanged" only when both the structural axis and functional axis are genuinely unchanged.

COMPARATIVE ANALYSIS:
6. For each system, evaluate the structural axis and the functional and burden axis independently. Indicate the direction of change on each: improvement, stagnation, or deterioration.
7. Identify completed or in-progress phase transitions.
8. Correlate observed changes with patient history and prior treatments if mentioned.

INTERPRETIVE PRIORITY:
Apply in this order: (1) relative improvement and burden reduction, (2) reduced congestion, density or overlay, (3) reduced stress and nervous tension expression, (4) improved regulation and compensation, (5) structural stabilization, (6) newly appearing burden, (7) structural deterioration only when clearly visible.

ACTIVE COMPARISON CHECKLIST:
On every comparison actively evaluate whether these changed: reduction of dark overlay, reduced congestion, reduced density, improved tissue brightness, less compressed appearance, improved circulatory openness, reduced nervous tension, softer autonomic compression, cleaner respiratory zones, reduced hepatic burden, improved energetic distribution, reduced inflammatory appearance, improved clarity of stressed zones, better energetic distribution between quadrants. If present, explicitly mention the improvement.

DIRECTIONAL INDICATOR:
Use improvement when the functional and burden axis improved, even if structure is unchanged. Write it as: Structurally stable, functionally improving.
Use stagnation only when no meaningful change is visible on either axis.
Use deterioration only when worsening is clearly visible, not inferred from persistent weakness.

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

LANGUAGE DISCIPLINE:
Avoid these absolute negatives unless both axes are genuinely unchanged: "no improvement", "no regeneration", "unchanged", "structurally maintained", "structurally entrenched", "stagnation", "no detectable shift", "holding pattern", "not recovering".

When mild improvement exists use calibrated language: "mild decompression", "partial reduction of burden", "slight clearing tendency", "improved regulation", "reduced overlay density", "softer congestion pattern", "improved energetic tone", "reduced stress marking", "stabilization with mild improvement", "functional improvement despite persistent structural weakness", "reduced metabolic burden", "reduced sympathetic pressure".

SECTION LOGIC:
Name the functional or burden shift first. Mention structural persistence second only if clinically relevant. Do not narrate unchanged morphology repeatedly. Avoid repeating "structure unchanged" in every section.

SECTION DISCIPLINE:
Keep each section concise and practitioner-focused — relevant iris observations only, clinically useful conclusions, minimal repetition. Avoid excessive narration of iris morphology.

AXES SECTION LOGIC:
The axes section must show evolution of the dominant burden flow between systems. Do not simply restate the previous sections. Focus on: what improved, what softened, what remains dominant, what still blocks recovery, which axis is now less burdened, which compensatory loop reduced or intensified. The axes section must read as systemic evolution, not repetition.

CONCLUSION LOGIC:
The conclusion must describe the overall trajectory. Use patterns such as: "partial improvement with persistent constitutional weakness", "functional improvement without structural rebuilding", "reduced congestion with ongoing depletion", "improved compensation with persistent weak zones". State "no meaningful change" once globally only if both axes are truly unchanged.

STRENGTHS SECTION:
Actively credit improvements visible in the iris: reduced hepatic burden, improved respiratory clarity, softer nervous tension, improved energetic distribution, reduced density in overloaded zones, better circulatory openness, stabilization without deterioration. Do not make the strengths section generic reassurance.

FINAL INTERNAL CHECK (before output):
Remove repetitive stagnation statements. Remove unnecessary morphology narration. Verify every strong claim is iris-supported. Verify the interpretation stays clinically useful. Ensure anatomy supports interpretation rather than replacing it. Keep the report balanced between over-pathologizing and excessive neutrality. Confirm you evaluated the functional and burden axis independently from the structural axis for every section, and that you have not defaulted to "unchanged" when functional burden reduction is visible.

BALANCE:
Do not inflate small visual changes into major recovery. Do not claim structural regeneration unless clearly visible. Do not ignore visible burden reduction simply because constitutional weakness remains. Stay clinically rigorous without becoming pathologically absolute.

RESPONSE FORMAT:
Respond EXCLUSIVELY with a valid JSON object with the following 13 keys. Section content must be in Markdown format and include comparative analysis with directional change indicators.

{
  "section_1_general_terrain": "Constitutional terrain analysis with temporal comparison. State system status label (e.g., Structurally stable, functionally improving).",
  "section_2_emotional_field": "Emotional field assessment with temporal comparison on both axes.",
  "section_3_cognitive_nervous": "Cognitive and nervous system analysis with temporal comparison on both axes.",
  "section_4_immune_lymphatic": "Immune and lymphatic system assessment with temporal comparison on both axes.",
  "section_5_endocrine_hormonal": "Endocrine and hormonal system analysis with temporal comparison on both axes.",
  "section_6_circulatory_cardiorespiratory": "Circulatory and cardiorespiratory system assessment with temporal comparison on both axes.",
  "section_7_hepatic": "Hepatic system analysis with temporal comparison on both axes.",
  "section_8_digestive_intestinal": "Digestive and intestinal system assessment with temporal comparison on both axes.",
  "section_9_renal_urinary": "Renal and urinary system analysis with temporal comparison on both axes.",
  "section_10_structural_integumentary": "Structural and integumentary system assessment with temporal comparison on both axes.",
  "section_11_detected_axes": "Functional axes showing systemic evolution. Format: Axis: System A and System B and System C (status label). Show what improved, what softened, what remains dominant.",
  "section_12_conclusion": "Overall trajectory: partial improvement, functional improvement without structural rebuilding, reduced congestion, or improved compensation. State absence of change once globally only if both axes are unchanged.",
  "section_13_strengths_of_the_body": "Credit improvements visible in the iris with clinical specificity. Reduced hepatic burden, softer nervous tension, improved energetic distribution, better circulatory openness, stabilization without deterioration."
}`
```

- [ ] **Step 2: Verify the constant compiles with no type errors**

```powershell
npx tsc --noEmit 2>&1 | Select-String "prompts.ts"
```

Expected: no lines referencing `prompts.ts`.

---

## Task 2: Update `COMPARISON_SYNTHESIS_INSTRUCTIONS`

**Files:**
- Modify: `src/lib/claude/compare.ts` (the `COMPARISON_SYNTHESIS_INSTRUCTIONS` constant, lines 14–24)

- [ ] **Step 1: Replace the constant**

In `src/lib/claude/compare.ts`, replace the string body of `COMPARISON_SYNTHESIS_INSTRUCTIONS` (between the backticks on lines 14–24) with:

```ts
export const COMPARISON_SYNTHESIS_INSTRUCTIONS = `=== SYNTHESIS INSTRUCTIONS ===
1. Start from Analysis A. Its JSON structure, writing style, and comparative format are the foundation.
2. From Analysis B, extract ONLY specific, named clinical findings or directional changes that are absent or understated in Analysis A. Discard pure visual iris descriptions.
3. Integrate extracted findings into the appropriate sections of Analysis A, phrased in your voice.
4. Where both analyses agree on a change, state it with stronger confidence. Where they contradict, keep Analysis A's position and note the discrepancy in one clause.
5. Every sentence must carry clinical value. Remove padding.
6. Output ONLY the final JSON. No preamble, no commentary, no markdown fences.

TWO-AXIS SYNTHESIS: For every section, confirm you evaluated the structural axis (fibres, lacunae, crypts, contraction rings, constitution) and the functional and burden axis (overlay, congestion, density, brightness, compression, circulatory openness, nervous tension, autonomic compression, respiratory clarity, hepatic burden, energetic distribution) independently. If the functional and burden axis improved, state it clearly even when structural weakness persists.

SYSTEM STATUS LABELS: Each section must carry one of: Structurally stable, functionally improving. Structurally stable, burden reduced. Structurally stable, compensated. Structurally stable, unchanged. Structurally weaker. Functionally worse. Improving structurally and functionally. Use "unchanged" only when both axes are genuinely unchanged.

LANGUAGE DISCIPLINE: Avoid "no improvement", "no regeneration", "unchanged", "structurally maintained", "structurally entrenched", "stagnation", "no detectable shift", "holding pattern", "not recovering" unless both axes are genuinely unchanged. When mild improvement exists use: "mild decompression", "partial reduction of burden", "slight clearing tendency", "improved regulation", "reduced overlay density", "softer congestion pattern", "stabilization with mild improvement", "functional improvement despite persistent structural weakness".

The reader is the practitioner and must NEVER see references to "Analysis A", "Analysis B", the model names, or any meta-commentary comparing the two source analyses. Never write phrases such as "Analysis B offered no contradiction". Produce one clean, integrated clinical report only.

Prioritise meaningful change: lead with what changed, what worsened, what improved, what stabilized, and what became compensatory. Do not rewrite unchanged sections unnecessarily, and do NOT repeat "stable", "stagnant", or "no change" in every section. State the absence of meaningful change once, globally, in the conclusion, only when both axes are truly unchanged.`
```

- [ ] **Step 2: Verify the file compiles**

```powershell
npx tsc --noEmit 2>&1 | Select-String "compare.ts"
```

Expected: no lines referencing `compare.ts`.

---

## Task 3: Update tests for `COMPARISON_ANALYSIS_SYSTEM_PROMPT`

**Files:**
- Modify: `src/lib/claude/__tests__/prompts.test.ts`

The existing `COMPARISON_ANALYSIS_SYSTEM_PROMPT` describe block (lines 77–101) passes. Add new assertions inside it to cover the two-axis blocks. Replace the existing describe block with:

- [ ] **Step 1: Replace the comparison describe block**

Find the describe block:
```ts
  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
```

Replace it (the entire block up to and including its closing `}`) with:

```ts
  describe('COMPARISON_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain comparison-specific temporal analysis rules', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('previous state')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('current state')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('direction of change')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('phase transitions')
    })

    it('should emphasize temporal comparison in base requirements', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('temporal comparative')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Prioritise FUNCTION')
    })

    it('should contain structural extraction and interpretation rules', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL EXTRACTION')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION RULES')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COMPARATIVE ANALYSIS')
    })

    it('contains interpretation discipline and comparison priority', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETATION DISCIPLINE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('INTERPRETIVE PRIORITY')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('do NOT repeat')
    })

    it('defines two axes of change with structural and functional axes', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('TWO AXES OF CHANGE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('STRUCTURAL AXIS')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('FUNCTIONAL AND BURDEN AXIS')
    })

    it('states the core rule about improvement without structural change', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CORE RULE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('improve clinically without visible fibre regeneration')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('functional and burden axis improved, the system improved')
    })

    it('defines system status labels', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('SYSTEM STATUS LABELS')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Structurally stable, functionally improving')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Structurally stable, burden reduced')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('Improving structurally and functionally')
    })

    it('contains the active comparison checklist', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('ACTIVE COMPARISON CHECKLIST')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('reduction of dark overlay')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('reduced hepatic burden')
    })

    it('enforces language discipline with prohibited negatives', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('LANGUAGE DISCIPLINE')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('no detectable shift')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('mild decompression')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('partial reduction of burden')
    })

    it('contains axes section logic and conclusion logic', () => {
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('AXES SECTION LOGIC')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('systemic evolution')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CONCLUSION LOGIC')
      expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('functional improvement without structural rebuilding')
    })
  })
```

- [ ] **Step 2: Run just the comparison describe block to verify**

```powershell
npx vitest run src/lib/claude/__tests__/prompts.test.ts --reporter=verbose 2>&1
```

Expected: all tests in the comparison describe block PASS. No failures.

---

## Task 4: Update tests for `COMPARISON_SYNTHESIS_INSTRUCTIONS`

**Files:**
- Modify: `src/lib/claude/__tests__/compare-synthesis.test.ts`

The existing single test covers no-leak. Replace with an expanded suite:

- [ ] **Step 1: Replace the entire test file content**

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

  it('includes two-axis synthesis instruction', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('TWO-AXIS SYNTHESIS')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('structural axis')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional and burden axis')
  })

  it('includes system status labels in synthesis', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('SYSTEM STATUS LABELS')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Structurally stable, functionally improving')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('Improving structurally and functionally')
  })

  it('includes language discipline in synthesis', () => {
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('LANGUAGE DISCIPLINE')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('no detectable shift')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('mild decompression')
    expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('functional improvement despite persistent structural weakness')
  })
})
```

- [ ] **Step 2: Run the synthesis test to verify**

```powershell
npx vitest run src/lib/claude/__tests__/compare-synthesis.test.ts --reporter=verbose 2>&1
```

Expected: 4 tests PASS.

---

## Task 5: Full test suite green check

- [ ] **Step 1: Run full suite**

```powershell
npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: 170+ tests passing, 0 failing. If any test fails, fix it before proceeding.

- [ ] **Step 2: Confirm TypeScript compiles clean**

```powershell
npx tsc --noEmit 2>&1
```

Expected: no output (zero errors).

---

## Self-Review — Spec Coverage

| Spec requirement | Covered in |
|---|---|
| TWO AXES OF CHANGE with structural and functional/burden axis | Task 1 — `COMPARISON_ANALYSIS_SYSTEM_PROMPT` |
| CORE RULE — improvement without structural change counts | Task 1 |
| Valid improvement examples (hepatic, nervous, respiratory) | Task 1 |
| SYSTEM STATUS LABELS — 7 labels | Task 1 + Task 2 (synthesis) |
| DIRECTIONAL INDICATOR — "Structurally stable, functionally improving" pattern | Task 1 |
| INTERPRETIVE PRIORITY — 7-level hierarchy | Task 1 |
| ACTIVE COMPARISON CHECKLIST — 14 items | Task 1 |
| LANGUAGE DISCIPLINE — prohibited negatives + calibrated alternatives | Task 1 + Task 2 |
| SECTION LOGIC — functional shift first | Task 1 |
| AXES SECTION LOGIC — systemic evolution not repetition | Task 1 |
| CONCLUSION LOGIC — trajectory description | Task 1 |
| STRENGTHS SECTION — credit improvements specifically | Task 1 |
| BALANCE — no inflation, no ignoring functional improvement | Task 1 |
| Synthesis respects two-axis framework | Task 2 |
| Tests cover all new blocks | Tasks 3 + 4 |
