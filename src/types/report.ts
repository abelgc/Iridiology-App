import {
  COMPARISON_REPORT_SECTION_KEYS,
  COMPARISON_REPORT_SECTION_LABELS,
  isComparisonReport,
} from './comparison-report'

export const REPORT_SECTION_KEYS = [
  'section_1_general_terrain',
  'section_2_emotional_field',
  'section_3_cognitive_nervous',
  'section_4_immune_lymphatic',
  'section_5_endocrine_hormonal',
  'section_6_circulatory_cardiorespiratory',
  'section_7_hepatic',
  'section_8_digestive_intestinal',
  'section_9_renal_urinary',
  'section_10_structural_integumentary',
  'section_11_detected_axes',
  'section_12_conclusion',
  'section_13_strengths_of_the_body',
  'section_14_recommendations',
] as const

export type ReportSectionKey = typeof REPORT_SECTION_KEYS[number]

// Practitioner-only sections: present in report_content but deliberately excluded from
// REPORT_SECTION_KEYS so client-facing code (writing-pipeline.ts, client-report-viewer.tsx,
// report-pdf-document.tsx — all keyed off REPORT_SECTION_KEYS directly) never surfaces them.
// The client-facing API route additionally strips these keys as a belt-and-braces guard — see
// src/app/api/client/reports/[token]/route.ts.
export const PRACTITIONER_ONLY_SECTION_KEYS = ['section_15_iris_sign_patterns'] as const

export type PractitionerOnlySectionKey = typeof PRACTITIONER_ONLY_SECTION_KEYS[number]

export type ReportContent = Record<string, string>

export const REPORT_SECTION_I18N_KEYS = {
  section_1_general_terrain:               'rSecGeneralTerrain',
  section_2_emotional_field:               'rSecEmotionalField',
  section_3_cognitive_nervous:             'rSecCognitiveNervous',
  section_4_immune_lymphatic:              'rSecImmuneLymphatic',
  section_5_endocrine_hormonal:            'rSecEndocrineHormonal',
  section_6_circulatory_cardiorespiratory: 'rSecCirculatory',
  section_7_hepatic:                       'rSecHepatic',
  section_8_digestive_intestinal:          'rSecDigestive',
  section_9_renal_urinary:                 'rSecRenalUrinary',
  section_10_structural_integumentary:     'rSecStructural',
  section_11_detected_axes:               'rSecDetectedAxes',
  section_12_conclusion:                   'rSecConclusion',
  section_13_strengths_of_the_body:        'rSecStrengths',
  section_14_recommendations:              'rSecRecommendations',
  section_15_iris_sign_patterns:           'rSecIrisSignPatterns',
} as const satisfies Record<ReportSectionKey | PractitionerOnlySectionKey, string>

export const REPORT_SECTION_LABELS: Record<ReportSectionKey | PractitionerOnlySectionKey, string> = {
  section_1_general_terrain: 'General Terrain',
  section_2_emotional_field: 'Emotional Field',
  section_3_cognitive_nervous: 'Cognitive and Nervous System',
  section_4_immune_lymphatic: 'Immune and Lymphatic System',
  section_5_endocrine_hormonal: 'Endocrine and Hormonal System',
  section_6_circulatory_cardiorespiratory: 'Circulatory and Cardio-Respiratory System',
  section_7_hepatic: 'Hepatic System',
  section_8_digestive_intestinal: 'Digestive and Intestinal System',
  section_9_renal_urinary: 'Renal, Urinary and Reproductive System',
  section_10_structural_integumentary: 'Structural and Integumentary System',
  section_11_detected_axes: 'Detected Axes',
  section_12_conclusion: 'Conclusion',
  section_13_strengths_of_the_body: 'Strengths of the Body',
  section_14_recommendations: 'Recommendations',
  section_15_iris_sign_patterns: 'Detected Iris Sign Patterns',
}

// Standard (13) + comparison (7) labels, used by the key-driven renderers so a
// report's section labels are resolved from its own shape.
const ALL_SECTION_LABELS: Record<string, string> = {
  ...REPORT_SECTION_LABELS,
  ...COMPARISON_REPORT_SECTION_LABELS,
}

export function getSectionLabel(key: string): string {
  return ALL_SECTION_LABELS[key] ?? key
}

// A report's section keys in canonical display order, resolved from its own shape.
// Standard reports return the 13 keys in order; comparison reports return the 7.
export function getOrderedSectionKeys(content: Record<string, string>): string[] {
  const present = new Set(Object.keys(content))
  const canonical: readonly string[] = isComparisonReport(content)
    ? COMPARISON_REPORT_SECTION_KEYS
    : [...REPORT_SECTION_KEYS, ...PRACTITIONER_ONLY_SECTION_KEYS]
  const ordered = canonical.filter((k) => present.has(k))
  for (const k of Object.keys(content)) if (!ordered.includes(k)) ordered.push(k)
  return ordered
}
