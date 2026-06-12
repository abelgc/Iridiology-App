// Comparison (evolution) reports use their OWN schema, independent of the 13-key
// standard report. Comparison is the primary axis; system interpretation is
// secondary. Nothing here is imported by the standard or review report paths.

export const COMPARISON_REPORT_SECTION_KEYS = [
  'comp_1_summary',
  'comp_2_improved',
  'comp_3_new',
  'comp_4_continued',
  'comp_5_stable',
  'comp_6_detected_axes',
  'comp_7_clinical_priorities',
] as const

export type ComparisonReportSectionKey = typeof COMPARISON_REPORT_SECTION_KEYS[number]

export type ComparisonReportContent = Record<ComparisonReportSectionKey, string>

export const COMPARISON_REPORT_SECTION_LABELS: Record<ComparisonReportSectionKey, string> = {
  comp_1_summary: 'Summary',
  comp_2_improved: 'Areas of Improvement',
  comp_3_new: 'New Findings',
  comp_4_continued: 'Still Requiring Attention',
  comp_5_stable: 'Stable Findings',
  comp_6_detected_axes: 'Detected Axes',
  comp_7_clinical_priorities: 'Clinical Priorities',
}

// A report stored in the reports table is a comparison (evolution) report when it
// carries the comparison keys. Used to route rendering without a DB/session join.
export function isComparisonReport(content: Record<string, string>): boolean {
  return Object.keys(content).some((k) => k.startsWith('comp_'))
}
