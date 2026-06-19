import { createAdminClient } from '@/lib/supabase/server'
import { isComparisonReport } from '@/types/comparison-report'

export interface PatientContext {
  previousReportSummary: string | null
  practitionerCorrections: string | null
}

export async function buildPatientContext(patientId: string): Promise<PatientContext> {
  const supabase = createAdminClient()

  // Query the most recent session for this patient
  const { data: latestSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('patient_id', patientId)
    .order('session_date', { ascending: false })
    .limit(1)
    .single()

  let previousReportSummary: string | null = null

  if (latestSession) {
    // Query the most recent report for that session
    const { data: reportData } = await supabase
      .from('reports')
      .select('report_content')
      .eq('session_id', latestSession.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (reportData) {
      const content = reportData.report_content as Record<string, string>
      const parts: string[] = []
      if (isComparisonReport(content)) {
        if (content.comp_1_improvements) parts.push(`Previous improvements:\n${content.comp_1_improvements}`)
        if (content.comp_2_not_improved) parts.push(`Previous persistent burden:\n${content.comp_2_not_improved}`)
        // backward compat: old 7-key stored reports
        if (!content.comp_1_improvements && !content.comp_2_not_improved) {
          const summary = content.comp_1_trajectory ?? content.comp_1_summary ?? content.comp_1_major_changes
          const axes = content.comp_6_axes ?? content.comp_6_detected_axes ?? content.comp_6_system_interpretation
          if (summary) parts.push(`Summary:\n${summary}`)
          if (axes) parts.push(`Detected Axes:\n${axes}`)
          if (content.comp_7_clinical_priorities) parts.push(`Clinical Priorities:\n${content.comp_7_clinical_priorities}`)
        }
      } else {
        if (content.section_1_general_terrain) parts.push(`General Terrain:\n${content.section_1_general_terrain}`)
        if (content.section_11_detected_axes) parts.push(`Detected Axes:\n${content.section_11_detected_axes}`)
        if (content.section_12_conclusion) parts.push(`Conclusion:\n${content.section_12_conclusion}`)
      }
      previousReportSummary = parts.length > 0 ? parts.join('\n\n') : null
    }
  }

  // Query report corrections for this patient
  const { data: correctionsData, error: correctionsError } = await supabase
    .from('report_corrections')
    .select('section_key, corrected_content, correction_notes')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(10)

  let practitionerCorrections: string | null = null

  if (!correctionsError && correctionsData && correctionsData.length > 0) {
    const formattedCorrections = correctionsData
      .map((correction) => {
        const notes = correction.correction_notes
          ? ` (Practitioner note: ${correction.correction_notes})`
          : ''
        return `Section ${correction.section_key}: ${correction.corrected_content}${notes}`
      })
      .join('\n\n')

    practitionerCorrections = formattedCorrections
  }

  return {
    previousReportSummary,
    practitionerCorrections,
  }
}
