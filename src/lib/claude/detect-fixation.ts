import type { ReportContent, ReportSectionKey } from '@/types/report'

// The 9 body-system sections SYSTEM CONNECTIONS (prompts.ts) governs — general_terrain,
// detected_axes, conclusion, strengths_of_the_body, and recommendations each have their own
// rule that legitimately lets the dominant system reappear (scene-setting, cross-system
// synthesis, or a non-prose format), so they're excluded from this check.
const BODY_SYSTEM_SECTIONS: ReportSectionKey[] = [
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
]

// One keyword per organ/system, drawn from the same catalogue the generation prompt itself
// reasons from (IRIDOLOGY_ACUTE_CHRONIC_SYMPTOM_MAP / IRIDOLOGY_VITAMIN_MINERAL_HERB_MAP in
// prompts.ts) — not a hand-picked shortlist. Any organ the model can name is trackable, not
// just the ones seen in a specific case. No "home section" exclusion: the SYSTEM CONNECTIONS
// prompt rule itself draws no such exception, and it keeps this correct as the catalogue
// grows, at the cost of occasionally re-grounding a section that was already fine — the
// rewrite guard only grounds existing evidence, never invents, so that cost is low.
const HUB_KEYWORDS: Record<string, RegExp> = {
  skin: /\bskin\b/i,
  lymphatic: /\blymphatic\b/i,
  spleen: /\b(spleen|splenic)\b/i,
  diaphragm: /\bdiaphragm\b/i,
  pleura: /\bpleura\b/i,
  colon: /\bcolon\b/i,
  lungs: /\blungs?\b/i,
  bronchi: /\bbronch/i,
  renal: /\b(renal|kidney)\b/i,
  uterus: /\b(uterus|uterine)\b/i,
  mammary: /\b(mammary|breast)\b/i,
  prostate: /\bprostate\b/i,
  reproductive: /\b(ovar(y|ies)|testicle)/i,
  autonomic: /\b(autonomic nervous system|ans wreath)\b/i,
  adrenal: /\badrenals?\b/i,
  pituitary: /\bpituitary\b/i,
  thyroid: /\bthyroid\b/i,
  thymus: /\bthymus\b/i,
  pancreas: /\bpancrea/i,
  stomach: /\bstomach\b/i,
  hepatic: /\b(liver|hepatic|bile|biliary)\b/i,
  gallbladder: /\bgallbladder\b/i,
  smallIntestine: /\bsmall intestine\b/i,
  pharynx: /\b(pharynx|oesophagus|esophagus)\b/i,
  cerebrum: /\b(cerebrum|cranial circulation)\b/i,
  earSinusEyeJaw: /\b(sinus|\btmj\b)/i,
  shoulder: /\bshoulder\b/i,
  heart: /\b(cardiac|heart)\b/i,
  hipSciatic: /\bsciatic\b/i,
  digestive: /\b(digestive|digestion|intestinal|gut)\b/i,
  immune: /\bimmune\b/i,
}

// Matches the SYSTEM CONNECTIONS cap in prompts.ts: no single system may be named as the
// causal driver in more than 2 of the 9 body-system sections.
const FIXATION_THRESHOLD = 2

export interface FixationFlag {
  hub: string
  count: number
  sections: ReportSectionKey[]
}

/**
 * Deterministic backstop for the SYSTEM CONNECTIONS prompt rule: counts, per organ/system, how
 * many of the 9 body-system sections mention it, and flags the worst offender if it exceeds
 * the cap the prompt itself asks the model to self-enforce. A keyword sweep, not a parse of
 * the connector sentence — cheaper and more robust than trying to regex the model's prose for
 * exactly which system it named as "the driver".
 */
export function detectDominantSystemFixation(report: ReportContent): FixationFlag | null {
  let worst: FixationFlag | null = null

  for (const [hub, pattern] of Object.entries(HUB_KEYWORDS)) {
    const hitSections = BODY_SYSTEM_SECTIONS.filter((key) => {
      const text = report[key]
      return typeof text === 'string' && pattern.test(text)
    })

    if (hitSections.length > FIXATION_THRESHOLD && (!worst || hitSections.length > worst.count)) {
      worst = { hub, count: hitSections.length, sections: hitSections }
    }
  }

  return worst
}

// Structural counterpart to the organ-hub check above: it never needs a keyword for
// "calcium" or "PTH" or whatever a future case's reported condition turns out to be. It
// catches HOW a section explains itself — leaning on "you already told me this" as the
// causal tie — not WHAT was told, which is what makes it generalise to any anchor a patient
// happens to report rather than a hand-picked list of conditions. Same >2-of-9 cap as above.
const HISTORY_CALLBACK_PATTERNS: RegExp[] = [
  /\byou(?:'ve| have)?\s+(?:mentioned|reported|described|said|noted|stated)\b/i,
  /\balready\s+(?:diagnosed|flagged|managed|under\s+(?:a\s+)?doctor)/i,
  /\b(?:lines up|fits(?:\s+well)?)\s+with what (?:you|shows here)/i,
]

export interface HistoryCallbackFlag {
  count: number
  sections: ReportSectionKey[]
}

/**
 * Deterministic backstop for a fixation mode the organ-hub check above cannot see: a
 * *reported condition* (not an organ) reused as the causal driver across too many sections.
 * Rather than matching the condition itself — which would need updating for every future
 * patient's wording — this matches the report's own explanatory pattern: an explicit
 * callback to patient-reported history standing in for the section's own iris-grounded
 * finding. More than 2 of the 9 body-system sections doing this is the same fixation the
 * organ guard targets, just on a different axis.
 */
export function detectHistoryCallbackOveruse(report: ReportContent): HistoryCallbackFlag | null {
  const hitSections = BODY_SYSTEM_SECTIONS.filter((key) => {
    const text = report[key]
    return typeof text === 'string' && HISTORY_CALLBACK_PATTERNS.some((pattern) => pattern.test(text))
  })

  return hitSections.length > FIXATION_THRESHOLD ? { count: hitSections.length, sections: hitSections } : null
}
