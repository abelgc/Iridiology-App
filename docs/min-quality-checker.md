# Min quality checker — minimum bar for an iridiology analysis

## Purpose
Canonical minimum-coverage checklist for any Stage-1 iridiology analysis
performed by an AI agent in this app. It exists because the report schema
(`src/lib/validators/report.ts`) only checks that all 15 sections are
present and non-empty — it cannot verify the model actually looked at both
irises, covered the major zones, or checked for the standard sign
categories. This doc is the quality gate the schema can't be.

It does **not** restate or override the interpretive rules already
enforced in `src/lib/claude/prompts.ts` (the Meaning Law, the
mechanistic-language ban, the severity-calibration ladder, the
jaundice/sclera safety boundary) or in `src/lib/client/writing-pipeline.ts`
(the assert-vs-redirect rule for client-facing prose). Those are the *how
to talk about it* rules. This doc is the *what did you actually look at*
rule.

## Who reads this
A condensed version of this checklist is embedded directly in the Stage-1
system prompt (`STANDARD_ANALYSIS_SYSTEM_PROMPT_EN` in
`src/lib/claude/prompts.ts`, right after STEP 1) — every analysis call
(single-model and both legs of dual-model) sees it before producing a
report. This file is the full, maintained source; the embedded version is
a compressed excerpt kept in sync with it.

## Minimum coverage checklist

An analysis meets the minimum bar only if all of the following are true:

### 1. Both irises
- [ ] Right iris scanned and referenced
- [ ] Left iris scanned and referenced
- [ ] Any right/left asymmetry explicitly named — silence on asymmetry is
      only acceptable when the irises are genuinely symmetrical, not
      because it was skipped

### 2. All zone rings
Every one of these rings must be addressed for at least one iris, even if
the finding is "no notable pattern here":
- [ ] Pupillary zone (innermost ring)
- [ ] Autonomic nerve wreath / collarette
- [ ] Inner ciliary zone
- [ ] Outer ciliary zone
- [ ] Limbus / outermost periphery

### 3. Minimum organ-system coverage
At least one clock-position finding (or an explicit "no notable finding")
for each of these systems, using the existing `IRIDOLOGY_IRIS_TERRITORY_MAP`
zone names:
- [ ] Digestive system (stomach/intestinal zones)
- [ ] Hepatic / liver-gallbladder zone
- [ ] Renal / urinary zone
- [ ] Cardiovascular zone
- [ ] Respiratory zone
- [ ] Lymphatic system
- [ ] Nervous system / brain zone
- [ ] Musculoskeletal zone

### 4. Sign categories checked, not skipped
For each of these, the report must either name a finding or explicitly
note its absence — a category that's simply never mentioned is a coverage
gap, not a clean bill:
- [ ] Lacunae (open and closed)
- [ ] Crypts
- [ ] Contraction rings / radial furrows
- [ ] Pigmentation / pigment spots
- [ ] Collarette shape and integrity
- [ ] Pupil shape/size irregularity
- [ ] Scleral markings

### 5. Colour and fibre density
- [ ] Overall fibre density/texture named (tight/dense vs. loose/relaxed)
- [ ] Iris and sclera colour named, with the functional meaning attached in
      the same sentence (per the existing Meaning Law — this doc doesn't
      add a new rule here, just confirms it happened)

### 6. Internal inventory step actually happened
- [ ] The report's content is consistent with a genuine "scan everything
      first" pass (per-zone findings are specific and varied, not a
      template repeated with organ names swapped in) — the closest a
      human reviewer can get to verifying the prompt's own "internal
      inventory" instruction was followed, since the schema can't check
      it automatically

## What "below the bar" looks like
Quick red flags a practitioner or reviewer can use without re-doing the
analysis:
- A section that could be copy-pasted onto a different patient's report
  unchanged (too generic, no specific iris evidence cited)
- Every body system given the same severity language ("moderate",
  "moderate", "moderate"...) — suggests no real per-zone differentiation
- No mention of the ANS wreath or collarette anywhere in the report —
  these are foundational iridology landmarks; their total absence is a
  strong signal a zone was skipped, not that it was unremarkable
- A left/right asymmetry that's visually obvious in the source photos but
  goes unmentioned

## What this doc is not
- Not a diagnostic checklist — it does not add new medical claims or
  lower the bar on the existing safety boundaries (jaundice/sclera
  referral, no disease-name assertions, no lab-value claims)
- Not a replacement for `IRIDOLOGY_IRIS_SIGN_CATALOGUE`'s vocabulary or
  `IRIDOLOGY_IRIS_TERRITORY_MAP`'s zone chart — this doc tells the model
  *to check everything the chart offers*, not what the chart says
- Not enforced automatically today — `src/lib/validators/report.ts` only
  checks presence/non-emptiness of the 15 sections; nothing currently
  parses report content against this checklist. If report quality becomes
  a measured problem, the next step would be an automated post-hoc
  checker (a cheap Haiku pass scoring a completed report against this
  list) rather than trusting the system prompt alone.
