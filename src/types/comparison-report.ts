// Comparison (evolution) reports use their OWN schema, independent of the 13-key
// standard report. Comparison is the primary axis; system interpretation is
// secondary. Nothing here is imported by the standard or review report paths.

export const COMPARISON_REPORT_SECTION_KEYS = [
  'comp_1_major_changes',
  'comp_2_burden_reduction',
  'comp_3_stable_constitutional',
  'comp_4_new_findings',
  'comp_5_continued_attention',
  'comp_6_system_interpretation',
  'comp_7_clinical_priorities',
] as const

export type ComparisonReportSectionKey = typeof COMPARISON_REPORT_SECTION_KEYS[number]

export type ComparisonReportContent = Record<ComparisonReportSectionKey, string>

export const COMPARISON_REPORT_SECTION_LABELS: Record<ComparisonReportSectionKey, string> = {
  comp_1_major_changes: 'Major Changes Since Last Session',
  comp_2_burden_reduction: 'Areas of Burden Reduction',
  comp_3_stable_constitutional: 'Stable Constitutional Findings',
  comp_4_new_findings: 'New Findings',
  comp_5_continued_attention: 'Areas Requiring Continued Attention',
  comp_6_system_interpretation: 'System Interpretation',
  comp_7_clinical_priorities: 'Clinical Priorities',
}

// A report stored in the reports table is a comparison (evolution) report when it
// carries the comparison keys. Used to route rendering without a DB/session join.
export function isComparisonReport(content: Record<string, string>): boolean {
  return 'comp_1_major_changes' in content
}
