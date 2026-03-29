import { createAdminClient } from '@/lib/supabase/server'
import { ReportContent, REPORT_SECTION_KEYS } from '@/types/report'

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
      const content = reportData.report_content as ReportContent
      previousReportSummary = content.section_11_ejes_detectados || null
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
