export interface Patient {
  id: string
  created_at: string
  updated_at: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  email: string | null
  phone: string | null
  general_history: string | null
  notes: string | null
}

export interface Session {
  id: string
  patient_id: string
  created_at: string
  session_date: string
  symptoms: string | null
  practitioner_notes: string | null
  analysis_mode: 'standard' | 'comparison' | 'technical_review'
  practitioner_interpretation: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'error'
}

export interface Report {
  id: string
  session_id: string
  created_at: string
  updated_at: string
  report_content: ReportContent
  report_version: number
  is_edited: boolean
}

export interface ReportCorrection {
  id: string
  report_id: string
  patient_id: string
  section_key: string
  original_content: string
  corrected_content: string
  correction_notes: string | null
  created_at: string
}

// Import ReportContent type from report.ts
import type { ReportContent } from './report'
export type { ReportContent }
