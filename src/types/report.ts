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
  'section_11_conclusion',
] as const

export type ReportSectionKey = typeof REPORT_SECTION_KEYS[number]

export type ReportContent = Record<ReportSectionKey, string>

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  section_1_terreno_general: 'Terreno General',
  section_2_campo_emocional: 'Campo Emocional',
  section_3_sistema_nervioso_cognitivo: 'Sistema Nervioso Cognitivo',
  section_4_sistema_inmunologico_linfatico: 'Sistema Inmunológico Linfático',
  section_5_sistema_endocrino_hormonal: 'Sistema Endocrino Hormonal',
  section_6_sistema_circulatorio_cardiorrespiratorio: 'Sistema Circulatorio Cardiorrespiratorio',
  section_7_sistema_hepatico: 'Sistema Hepático',
  section_8_sistema_digestivo_intestinal: 'Sistema Digestivo Intestinal',
  section_9_sistema_renal_urinario_reproductivo: 'Sistema Renal Urinario Reproductivo',
  section_10_sistema_estructural_integumentario: 'Sistema Estructural Integumentario',
  section_11_conclusion: 'Conclusión',
}
