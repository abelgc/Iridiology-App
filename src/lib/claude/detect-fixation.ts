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

// A section whose own subject already legitimately overlaps a hub's keyword — excluded from
// that hub's count so a section isn't flagged for describing its own system.
const OWN_SECTION_FOR_HUB: Record<string, ReportSectionKey> = {
  hepatic: 'section_7_hepatic',
  digestive: 'section_8_digestive_intestinal',
  immune: 'section_4_immune_lymphatic',
  lymphatic: 'section_4_immune_lymphatic',
  renal: 'section_9_renal_urinary',
}

const HUB_KEYWORDS: Record<string, RegExp> = {
  hepatic: /\b(liver|hepatic|bile|biliary)\b/i,
  adrenal: /\badrenals?\b/i,
  thyroid: /\bthyroid\b/i,
  digestive: /\b(digestive|digestion|intestinal|gut)\b/i,
  immune: /\bimmune\b/i,
  lymphatic: /\blymphatic\b/i,
  renal: /\b(renal|kidney)\b/i,
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
 * Deterministic backstop for the SYSTEM CONNECTIONS prompt rule: counts, per hub system, how
 * many OTHER body-system sections mention it, and flags the worst offender if it exceeds the
 * cap the prompt itself asks the model to self-enforce. A keyword sweep, not a parse of the
 * connector sentence — cheaper and more robust than trying to regex the model's prose for
 * exactly which system it named as "the driver".
 */
export function detectDominantSystemFixation(report: ReportContent): FixationFlag | null {
  let worst: FixationFlag | null = null

  for (const [hub, pattern] of Object.entries(HUB_KEYWORDS)) {
    const ownSection = OWN_SECTION_FOR_HUB[hub]
    const hitSections = BODY_SYSTEM_SECTIONS.filter((key) => {
      if (key === ownSection) return false
      const text = report[key]
      return typeof text === 'string' && pattern.test(text)
    })

    if (hitSections.length > FIXATION_THRESHOLD && (!worst || hitSections.length > worst.count)) {
      worst = { hub, count: hitSections.length, sections: hitSections }
    }
  }

  return worst
}
