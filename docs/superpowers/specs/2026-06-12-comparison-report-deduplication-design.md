# Comparison Mode — De-duplication via Single-Description Structure

**Date:** 2026-06-12
**Status:** Design approved, pending spec review
**Scope:** `/practitioner` comparison mode ONLY. Standard and technical-review modes are not touched.

---

## Problem

Comparison reports restate the same finding 3–6 times. Measured on `docs/comparission june 2.pdf`:

| Finding | Sections describing it | Count |
|---|---|---|
| Intestinal lacunae now visible | Major Changes, Stable, New, Continued Attention, System Interpretation, Clinical Priorities | 6 |
| Autonomic/collarette compression | Major Changes, Burden Reduction, Continued Attention, System Interpretation, Clinical Priorities | 5 |
| Hepatic overlay reduction | Major Changes, Burden Reduction, System Interpretation, Clinical Priorities | 4 |
| Endocrine/peri-pupillary load | Continued Attention, System Interpretation, Clinical Priorities | 3 |

### Root cause (architectural, not prose-discipline)

The current 7-section taxonomy is **seven overlapping lenses over the same finding set**, not a partition. Each section asks a different question that reaches for the same findings:

- Major Changes = which findings are biggest? (a *digest* of the others)
- Burden Reduction = which improved?
- Stable = which didn't change?
- New Findings = which are newly visible?
- Continued Attention = which are still burdened?
- System Interpretation = how do they link causally?
- Clinical Priorities = what to do about them?

A single finding legitimately answers most of these at once, so the structure itself orders the model to write it into several sections. Three prior prompt rewrites (`a7fc0b4`, `11c1a81`, `21c5102` — the last added an explicit "state each finding once" rule) failed because a prose instruction cannot beat a structure that is overlapping by construction. **Wrong layer.**

---

## The fix — one rule

> **Exactly ONE section is allowed to describe a finding. Every other section may only *name* it.**

Today five sections describe findings (Major Changes, Burden Reduction, Stable, New, Continued Attention) and two more re-describe them (Interpretation, Priorities). The fix collapses description into a **single partitioned block** and makes the surrounding sections **formats too tight to hold a description**.

Two enforcement mechanisms, neither relying on "please don't repeat":

1. **Partition the description by change-vector.** Every finding is assigned exactly one *dominant* vector — Improved, New, Still-a-problem, or Stable — and is described in that one column only. A finding can genuinely qualify for several (the revealed lacunae are stable, new, AND active); the prompt forces it to pick the vector carrying the clinical action, so it is described once and named elsewhere.
2. **Make Summary, Detected Axes, and Clinical Priorities formats that have no slot for a description.**
   - Summary: ≤3 sentences, names the top improvement and top burden *by territory*, never describes them.
   - Detected Axes: arrow-notation lines only — `Axis: A → B → C — Phase`. There is physically nowhere to write a finding's prose.
   - Clinical Priorities: `N. Territory → action verb phrase`. Names the territory, states what to DO, never what it is.

The intestinal lacunae are *described* once (New column). In Axes they are the token `intestinal` in a chain. In Priorities they are `Intestinal → microbiome/mucosal/motility support`. No format around the New column can re-describe them.

---

## New schema

Replaces the 7 keys in `src/types/comparison-report.ts`. Display order = key order.

| Key | Label | Role | Constraint |
|---|---|---|---|
| `comp_1_summary` | Summary | Tight lead (replaces "Major Changes") | ≤3 sentences. Names top improvement + top burden + overall trajectory by territory. NO descriptions. |
| `comp_2_improved` | Areas of Improvement | Description column (vector = improved) | Each improved finding described **once**, with territory + system. |
| `comp_3_new` | New Findings | Description column (vector = new) | Each newly-visible finding described **once**. "None" in one sentence if empty. |
| `comp_4_continued` | Still Requiring Attention | Description column (vector = burdened/worsening) | Each persistent/worsening burden described **once**. Distinguish stable-but-persistent from worsening. |
| `comp_5_stable` | Stable Findings | Description column (vector = stable) | What genuinely did not change, briefly, once. |
| `comp_6_detected_axes` | Detected Axes | Tight format (replaces "System Interpretation" prose) | Arrow lines only: `Axis: system → system → system — Phase`. One per line. No prose paragraphs. |
| `comp_7_clinical_priorities` | Clinical Priorities | Tight format | `N. Territory → action`. Verb phrases. References findings by name; never re-describes. |

The four description columns (`comp_2`–`comp_5`) become a partition on change-vector **only because the prompt forces each finding to a single dominant vector** (see prompt change #2). They are NOT a partition automatically: in june 2 the intestinal lacunae appeared in three columns at once (Stable, because constitutionally unchanged; New, because newly visible; Continued Attention, because clinically active). The "one dominant vector per finding" rule is what collapses those three placements into one. `comp_1`, `comp_6`, `comp_7` are reference-only.

### What changed vs the old schema

- `comp_1_major_changes` (a digest that repeated everything) → `comp_1_summary` (tight, names-only). This satisfies the user's "merge Major Changes + Burden Reduction" instinct: the digest is gone; the lead is the only summary.
- `comp_6_system_interpretation` (free prose that re-described findings) → `comp_6_detected_axes` (arrow notation). This **restores the Detected Axes section** that standard/technical modes have and comparison had lost.
- `comp_7_clinical_priorities` retained but constrained to action-only format.
- `comp_2`–`comp_5` retained as the four vector columns, but now governed by the single-dominant-vector rule that makes them genuinely non-overlapping. Without that rule they overlap, which is part of what june 2 showed.

---

## Prompt changes — `COMPARISON_ANALYSIS_SYSTEM_PROMPT`

The existing STEP 1 (detect changes → flat list) and STEP 2 (classify A–E) already build a findings inventory internally, then discard it into 7 prose sections. The rewrite makes that inventory the backbone of the output:

1. **Keep** STEP 1 (global change detection → flat list) and STEP 2 (classify), but rename the classes to the four vectors: Improved / New / Still-a-problem / Stable.
2. **Add the single-description rule** explicitly: a finding is described in exactly one of `comp_2`–`comp_5`, chosen by its dominant vector. If a finding is both new and burdened (e.g. the revealed lacunae), it picks the vector that carries the clinical action — described once there, named elsewhere.
3. **Rewrite RESPONSE FORMAT** to the 7 keys above, with the per-key constraints from the schema table baked into each key's instruction string.
4. **Replace** the REDUNDANCY CONTROL paragraph (the failed prose plea) with the format constraints — they do the work the paragraph couldn't.
5. Axes format reuses the standard prompt's existing `Axis: a and b and c` convention, adapted to `→` with a phase tag.

`STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` and `TECHNICAL_REVIEW_SYSTEM_PROMPT` are **not** edited.

## Synthesis changes — `COMPARISON_SYNTHESIS_INSTRUCTIONS` (`src/lib/claude/compare.ts`)

The dual-model synthesis instructions are rewritten to the new 7-key structure and the single-description rule, so the merge step does not re-introduce repetition when combining the two providers' outputs.

---

## Wiring (low cost — last session's plumbing is reused)

The rendering pipeline is already key-driven (`getOrderedSectionKeys`, `getSectionLabel`), so display, Print, inline Edit, Edit page, EN/ES Translate, Chat, and corrections all follow the schema automatically. Files:

- `src/types/comparison-report.ts` — new `COMPARISON_REPORT_SECTION_KEYS` + `COMPARISON_REPORT_SECTION_LABELS`.
- `src/lib/validators/comparison-report.ts` — auto-follows the key list (already derives from `COMPARISON_REPORT_SECTION_KEYS`).
- `src/lib/claude/prompts.ts` — rewrite the comparison prompt's RESPONSE FORMAT + rules (comparison only).
- `src/lib/claude/compare.ts` — rewrite `COMPARISON_SYNTHESIS_INSTRUCTIONS`.
- `src/lib/claude/parse-comparison.ts` — unchanged (validates against the schema, which follows the keys).

### Backward compatibility (non-destructive)

Existing saved comparison reports (june 1, june 2) hold the OLD keys. To keep them viewable:

- `isComparisonReport()` must detect both old and new shapes. Change it from `'comp_1_major_changes' in content` to a **prefix check**: any key starting with `comp_`. Robust to future schema changes.
- `getOrderedSectionKeys` already appends unknown keys after canonical ones, and `getSectionLabel` falls back to the raw key. So old reports still render (with their old labels); no migration or data loss.

---

## Testing

- `src/lib/claude/__tests__/comparison-report.test.ts` — update regression: validate the new 7-key shape, reject the standard 13-key shape, assert `isComparisonReport` detects both old (`comp_1_major_changes`) and new (`comp_1_summary`) shapes.
- `src/lib/claude/__tests__/prompts.test.ts` — assert the comparison prompt contains the new keys, the single-description rule, the arrow-notation axes format, and does NOT contain `section_` keys; assert standard/technical prompts unchanged.
- `src/lib/claude/__tests__/compare-synthesis.test.ts` — assert synthesis instructions reference the new structure.
- Full `vitest run` must stay green.

### Unverifiable in-environment

Whether real output actually stops repeating requires a live comparison run with real iris images. The format constraints make repetition structurally hard, but the qualitative result must be confirmed by generating one report post-deploy (as the user did with june 1 / june 2).

---

## Out of scope (YAGNI)

- No change to standard or technical-review modes.
- No data migration of existing reports (backward-compat render covers them).
- No structured-JSON-array rendering (a single internal inventory feeding thin sections is the model; the output stays section-string keyed to match the existing viewer).
