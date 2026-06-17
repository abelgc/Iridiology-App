# Colour, Sclera, and Meaning Across All Modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the iridology engine reason from iris AND sclera colour/hue as meaningful clinical evidence in every mode (standard, technical-review, comparison), enforce "description + meaning, never description alone," and fix the comparison "image-quality excuse / zero-improvements" bug.

**Architecture:** One shared constant `IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE` defined once in `prompts.ts` and interpolated into all three system prompts (DRY). It encodes the practitioner's colour/fibre/sclera legend as *calibrated supporting evidence* (not gospel), carries a "description + meaning" law, a photo caveat, and a medical-referral safety boundary. Anti-colour lines in comparison and technical prompts are reversed. Comparison-only blocks ban the magnification/"new baseline" excuse and force a better/worse change calibration. The dual-model synthesis carries the same rules. Tests are content assertions on the exported prompt strings.

**Tech Stack:** TypeScript, Vitest, Zod. AI prompts are exported template-literal constants in `src/lib/claude/prompts.ts` and `src/lib/claude/compare.ts`.

**Scope note:** This deliberately changes standard + technical modes (previously colour-free), per explicit user request. The plan touches `prompts.ts` (one file, sequential ownership), `compare.ts`, and two test files.

---

## File Structure

- `src/lib/claude/prompts.ts`
  - NEW: `IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE` constant (shared guide).
  - MODIFY: `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` — inject guide.
  - MODIFY: `COMPARISON_ANALYSIS_SYSTEM_PROMPT` — inject guide, reverse anti-colour line, expand image ban, add IMAGE CONDITIONS + CHANGE CALIBRATION blocks, sclera in comp_2.
  - MODIFY: `TECHNICAL_REVIEW_SYSTEM_PROMPT` — inject guide, reverse two anti-colour lines.
- `src/lib/claude/compare.ts`
  - MODIFY: `COMPARISON_SYNTHESIS_INSTRUCTIONS` — add image-conditions + change-direction + sclera/colour rule.
- `src/lib/claude/__tests__/prompts.test.ts` — assertions for the guide in all three prompts + comparison fix blocks.
- `src/lib/claude/__tests__/compare-synthesis.test.ts` — assertions for synthesis additions.

---

## Task 1: Shared colour/fibre/sclera guide constant

**Files:**
- Modify: `src/lib/claude/prompts.ts` (add constant near top, before `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Write the failing test** (add a new `describe` block)

```ts
import { IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE } from '../prompts'

describe('IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE', () => {
  it('encodes colour associations, sclera, the meaning law, and the safety boundary', () => {
    const g = IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE
    expect(g).toContain('COLOUR AND FIBRE GUIDE')
    expect(g).toContain('SCLERA')
    expect(g).toContain('chicken-fat')
    expect(g).toContain('Brown')
    expect(g).toContain('Fluorescent orange')
    expect(g).toContain('SAFETY BOUNDARY')
    expect(g).toContain('medical referral')
    // The meaning law:
    expect(g).toContain('never name a colour without')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "COLOUR_FIBRE_SCLERA"`
Expected: FAIL — `IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE` is not exported.

- [ ] **Step 3: Add the constant** (insert before `export const STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`)

```ts
export const IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE = `IRIS AND SCLERA COLOUR AND FIBRE GUIDE:
Colour, hue, and fibre tone are interpretive evidence that SUPPORTS a functional conclusion — never the sole basis for one. Weigh them with structure (fibres, lacunae, wreath, rings) and patient history. THE MEANING LAW: every colour or fibre observation in the report MUST carry its functional meaning in the same sentence — never name a colour without the conclusion it supports. Description without interpretation is prohibited. Do not over-call from colour alone. Colour read from a photograph is approximate; do not split fine distinctions a camera cannot resolve. Colour and hue shifts remain readable and comparable even when an image is imperfect. Use these associations as calibrated guidance, not fixed rules:

FIBRES:
- White, light, or raised fibres mean reaction, irritation, inflammation, pain, or discharge; the stroma is raised or inflamed. In blue eyes these read white; in biliary (hazel) eyes they carry a yellow tint.
- Grey fibres mean relaxed fibres and weakness in the organ, gland, or tissue; less severe than very dark signs.
- Black signs mean inherited genetic weakness (often pancreas or kidney) where tissue reacts poorly to toxins and stress; a more deficient, chronic area.

COLOURS (apply to iris AND sclera):
- Yellow suggests reduced kidney function. Yellow "chicken-fat" deposits in the sclera usually point to gallbladder or liver. Because thyroid hormone is converted in the liver, also check the thyroid reaction field when yellow appears.
- Grey means hypoactive or underactive metabolism in the mapped area (for example stomach or digestive zone); under-active or poorly innervated tissue.
- Orange means difficulty metabolising carbohydrates, suggesting liver and pancreas weakness; consider flagging blood-sugar review, especially with right-side discomfort.
- Fluorescent orange points primarily to the gallbladder, possibly pancreas and liver. A photograph rarely separates this from plain orange — do not over-distinguish the two from an image.
- Brown means poor liver function and sluggish or toxic blood; whatever the shade, check the liver reaction field. Brown spots in the sclera also point back to the liver.
- Black means long-standing, chronic, multi-generational weakness; flag as a priority, most often liver-related.

SCLERA (white of the eye):
When the sclera is visible, read it alongside the iris and apply this colour guide to it. Scleral vascular congestion and redness, vessel course and branching, yellow or brown discoloration, chicken-fat deposits, and overall clarity are recognised signs that each carry meaning. If the sclera is not captured in the frame, omit it without comment — never remark on its absence or on image framing.

SAFETY BOUNDARY:
A completely yellow sclera (possible hepatitis or jaundice) is outside iridology — recommend medical referral rather than interpreting it as a functional sign.`
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "COLOUR_FIBRE_SCLERA"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "feat(prompts): shared iris+sclera colour/fibre guide with meaning law"
```

---

## Task 2: Inject the guide into the STANDARD prompt

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`STANDARD_ANALYSIS_SYSTEM_PROMPT_EN`, after the `SEVERITY CALIBRATION` block / before `STRUCTURAL VS FUNCTIONAL`)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the failing assertion** (inside the existing `STANDARD_ANALYSIS_SYSTEM_PROMPT` describe)

```ts
it('integrates the colour, sclera, and meaning guide', () => {
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
  expect(STANDARD_ANALYSIS_SYSTEM_PROMPT).toContain('never name a colour without')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "colour, sclera, and meaning guide"`
Expected: FAIL.

- [ ] **Step 3: Interpolate the guide.** Find the `SEVERITY CALIBRATION:` block end in `STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` (the paragraph ending `...active, compensatory, or secondary.`) and insert immediately after it:

```
${IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE}
```

(So the literal reads: `...active, compensatory, or secondary.\n\n${IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE}\n\nSTRUCTURAL VS FUNCTIONAL:` — the guide sits between SEVERITY CALIBRATION and STRUCTURAL VS FUNCTIONAL.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "colour, sclera, and meaning guide"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "feat(prompts): standard report reads iris+sclera colour with meaning"
```

---

## Task 3: Inject the guide into COMPARISON + reverse its anti-colour line

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`COMPARISON_ANALYSIS_SYSTEM_PROMPT`)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the failing assertion** (inside the `COMPARISON_ANALYSIS_SYSTEM_PROMPT` describe)

```ts
it('reads iris+sclera colour as evidence, not forbidden', () => {
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('SCLERA')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "colour as evidence, not forbidden"`
Expected: FAIL.

- [ ] **Step 3a: Reverse the anti-colour OUTPUT STYLE bullet**

```
BEFORE: - Be direct, specific, and clinical. Do not mention iris colour tones.
AFTER:  - Be direct, specific, and clinical. Read iris and scleral colour as evidence per the colour guide.
```

- [ ] **Step 3b: Interpolate the guide** before the `PROCEDURE:` line:

```
${IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE}

PROCEDURE:
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "colour as evidence, not forbidden"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "feat(comparison): colour+sclera evidence, reverse no-colour rule"
```

---

## Task 4: Inject the guide into TECHNICAL + reverse its two anti-colour lines

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`TECHNICAL_REVIEW_SYSTEM_PROMPT`)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the failing assertion** (inside the `TECHNICAL_REVIEW_SYSTEM_PROMPT` describe)

```ts
it('reads colour+sclera as supporting evidence, not forbidden', () => {
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('COLOUR AND FIBRE GUIDE')
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).toContain('SCLERA')
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Do not mention iris colour tones')
  expect(TECHNICAL_REVIEW_SYSTEM_PROMPT).not.toContain('Prioritise reading these structures over any chromatic observation')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "supporting evidence, not forbidden"`
Expected: FAIL.

- [ ] **Step 3a: Reverse the STRUCTURAL EXTRACTION line**

```
BEFORE: ...and other topographic signs. Prioritise reading these structures over any chromatic observation.
AFTER:  ...and other topographic signs. Read these structures together with iris and scleral colour (see colour guide); structure and colour both inform the interpretation.
```

- [ ] **Step 3b: Reverse INTERPRETATION RULES item 1**

```
BEFORE: 1. Prioritise FUNCTION over colour description. Do not mention iris colour tones in the report.
AFTER:  1. Use colour as supporting evidence for function (see colour guide); never let colour replace functional interpretation.
```

- [ ] **Step 3c: Interpolate the guide** immediately before the `INTERPRETATION RULES:` heading:

```
${IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE}

INTERPRETATION RULES:
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "supporting evidence, not forbidden"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "feat(technical): colour+sclera as supporting evidence, reverse no-colour rules"
```

---

## Task 5: Comparison bug fixes — image-excuse ban + change calibration + sclera improvements

**Files:**
- Modify: `src/lib/claude/prompts.ts` (`COMPARISON_ANALYSIS_SYSTEM_PROMPT`)
- Test: `src/lib/claude/__tests__/prompts.test.ts`

- [ ] **Step 1: Add the failing assertion**

```ts
it('bans the image-quality excuse and forces a change direction', () => {
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('NEVER AN EXCUSE')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('new baseline')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('CHANGE CALIBRATION')
  expect(COMPARISON_ANALYSIS_SYSTEM_PROMPT).toContain('magnification')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "bans the image-quality excuse"`
Expected: FAIL.

- [ ] **Step 3a: Expand the image-quality ban bullet**

```
BEFORE: - Avoid lists, bullet points, and image-quality commentary. Never mention blur, glare, lighting, or technical image issues.
AFTER:  - Avoid lists, bullet points, and image-quality commentary. Never mention blur, glare, lighting, magnification, zoom, field of view, framing, sharpness, resolution, or any technical image issue.
```

- [ ] **Step 3b: Insert the IMAGE CONDITIONS block** before `PROCEDURE:` (it will sit alongside the guide added in Task 3; order: guide, then this block, then PROCEDURE)

```
IMAGE CONDITIONS — NEVER AN EXCUSE:
The two image sets may differ in magnification, framing, field of view, sharpness, or resolution. This is NEVER a reason to abstain from comparison and must NEVER appear in the report. Do not write "macroscopic", "higher magnification", "tissue-level", "below the resolution threshold", "first fully-resolved", "new baseline", "first complete baseline", or any statement that the previous images were inadequate to compare against. Never explain the absence of a change by an image difference. If a region is clearer in one set, examine the available detail closely and compare what is genuinely visible in BOTH sets. You always compare; you never decline to compare. Colour and hue shifts are especially robust to image quality — use them.
```

- [ ] **Step 3c: Insert the CHANGE CALIBRATION block** immediately after the STEP 2 line ending `...E. Deteriorations.`

```
CHANGE CALIBRATION (commit to a direction):
Functional and burden findings (overlay density, congestion, stromal luminosity, collarette spacing, circulatory openness, respiratory clarity, autonomic compression, and colour or hue shifts) almost always move between sessions — expect them to be BETTER or WORSE, rarely identical. For each functional finding commit to a direction and justify it with the specific visual change you observe. "Unchanged" on the functional axis is the exception, not the default; when you claim it, justify WHY it genuinely did not move. Constitutional structure (fibre density, lacuna positions, contraction-ring architecture) is legitimately stable and belongs in Stable Findings with brief justification. A blanket "no improvement anywhere" is almost always a failure to look closely, not a clinical finding — do not produce one.
```

- [ ] **Step 3d: Add sclera/colour to the comp_2_improved key string**

```
BEFORE: ...State functional improvement clearly even where structure is unchanged. Described here and nowhere else.
AFTER:  ...State functional improvement clearly even where structure is unchanged. Include scleral and colour-shift improvements (reduced redness or vascular congestion, lighter tint, fading brown or yellow overlay, improved clarity) where visible. Described here and nowhere else.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/prompts.test.ts -t "bans the image-quality excuse"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/prompts.ts src/lib/claude/__tests__/prompts.test.ts
git commit -m "fix(comparison): ban image excuse, force change direction, count colour shifts"
```

---

## Task 6: Synthesis carries the same rules

**Files:**
- Modify: `src/lib/claude/compare.ts` (`COMPARISON_SYNTHESIS_INSTRUCTIONS`)
- Test: `src/lib/claude/__tests__/compare-synthesis.test.ts`

- [ ] **Step 1: Add the failing assertion**

```ts
it('bans the image excuse and reads colour + sclera', () => {
  expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('never frame the current session as a new baseline')
  expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('sclera')
  expect(COMPARISON_SYNTHESIS_INSTRUCTIONS).toContain('better or worse')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/claude/__tests__/compare-synthesis.test.ts -t "bans the image excuse"`
Expected: FAIL.

- [ ] **Step 3: Insert the rule** immediately before `SINGLE-DESCRIPTION DISCIPLINE:` in `COMPARISON_SYNTHESIS_INSTRUCTIONS`

```
IMAGE CONDITIONS AND CHANGE: Never attribute the absence of change to image quality, magnification, field of view, or resolution, and never frame the current session as a new baseline. Functional findings are expected to be better or worse, rarely identical — commit to a direction. Read the sclera (white of the eye) and iris/scleral colour where visible, and report colour and scleral change in the same framework, each observation carrying its functional meaning.
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/claude/__tests__/compare-synthesis.test.ts -t "bans the image excuse"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/compare.ts src/lib/claude/__tests__/compare-synthesis.test.ts
git commit -m "fix(compare): synthesis bans image excuse, reads colour+sclera, commits direction"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the entire suite**

Run: `npx vitest run`
Expected: all files pass (was 176/176; new assertions add to that count).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (ignore pre-existing vitest-global `Cannot find name 'describe'/'it'/'expect'` noise)
Expected: no new errors.

- [ ] **Step 3: Final commit if anything outstanding** (otherwise skip)

```bash
git status
```

---

## Self-Review

- **Spec coverage:** colour in all 3 modes (Tasks 2,3,4) ✓; sclera in all 3 modes (via shared guide, Tasks 2,3,4) ✓; description+meaning law (Task 1 guide, asserted) ✓; colour legend faithfully encoded (Task 1) ✓; "not gospel" framing (Task 1) ✓; image-excuse ban (Task 5) ✓; better/worse calibration (Task 5) ✓; zero-improvements fix (Task 5 calibration + image ban) ✓; synthesis parity (Task 6) ✓; safety referral for full-yellow sclera (Task 1) ✓.
- **Placeholder scan:** none — every step has concrete content/commands.
- **Type/name consistency:** constant name `IRIDOLOGY_COLOUR_FIBRE_SCLERA_GUIDE` used identically across Tasks 1–4; import added in Task 1's test, reused.

## Notes on agent separation (execution)

All prompt edits live in one file (`prompts.ts`), so Tasks 1–5 cannot run as parallel agents without colliding — they execute sequentially under a single implementer. Task 6 (`compare.ts`) and the verification (Task 7) are independent and can be a separate agent/stage. Recommended: one implementation subagent for Tasks 1–6 (sequential, single-context), then independent verification (Task 7 + a code review) as a separate stage.
