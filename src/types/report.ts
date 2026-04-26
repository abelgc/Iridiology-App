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
] as const

export type ReportSectionKey = typeof REPORT_SECTION_KEYS[number]

export type ReportContent = Record<ReportSectionKey, string>

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
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
}
