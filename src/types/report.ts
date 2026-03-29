export const REPORT_SECTION_KEYS = [
  'section_1_terreno_general',
  'section_2_campo_emocional',
  'section_3_sistema_nervioso_cognitivo',
  'section_4_sistema_inmunologico_linfatico',
  'section_5_sistema_endocrino_hormonal',
  'section_6_sistema_circulatorio_cardiorrespiratorio',
  'section_7_sistema_hepatico',
  'section_8_sistema_digestivo_intestinal',
  'section_9_sistema_renal_urinario_reproductivo',
  'section_10_sistema_estructural_integumentario',
  'section_11_ejes_detectados',
  'section_12_enfoque_ayurvedico',
  'section_13_protocolo_tratamiento',
  'section_14_alimentacion',
] as const

export type ReportSectionKey = typeof REPORT_SECTION_KEYS[number]

export type ReportContent = Record<ReportSectionKey, string>

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  section_1_terreno_general: 'General Terrain',
  section_2_campo_emocional: 'Emotional Field',
  section_3_sistema_nervioso_cognitivo: 'Cognitive & Nervous System',
  section_4_sistema_inmunologico_linfatico: 'Immune & Lymphatic System',
  section_5_sistema_endocrino_hormonal: 'Endocrine & Hormonal System',
  section_6_sistema_circulatorio_cardiorrespiratorio: 'Circulatory & Cardiorespiratory System',
  section_7_sistema_hepatico: 'Hepatic System',
  section_8_sistema_digestivo_intestinal: 'Digestive & Intestinal System',
  section_9_sistema_renal_urinario_reproductivo: 'Renal & Urinary System',
  section_10_sistema_estructural_integumentario: 'Structural & Integumentary System',
  section_11_ejes_detectados: 'Detected Axes',
  section_12_enfoque_ayurvedico: 'Ayurvedic Approach',
  section_13_protocolo_tratamiento: 'Treatment Protocol',
  section_14_alimentacion: 'Food Recommendations',
}
