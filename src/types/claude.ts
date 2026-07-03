export interface AnalysisRequest {
  sessionId: string
  patientId: string
  rightIrisBase64: string
  leftIrisBase64: string
  patientData: {
    full_name: string
    date_of_birth: string | null
    country_of_birth?: string | null
    city_of_birth?: string | null
    time_of_day?: string | null
    gender: string | null
    general_history: string | null
    symptoms: string | null
    practitioner_notes: string | null
  }
  health_questionnaire?: Record<string, unknown> | null
}

export interface ComparisonRequest extends AnalysisRequest {
  previousRightIrisBase64: string
  previousLeftIrisBase64: string
  previousSessionDate: string
}

export interface TechnicalReviewRequest extends AnalysisRequest {
  practitionerInterpretation: string
}

export interface ChatRequest {
  reportId: string
  message: string
  chatHistory: ChatMessage[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SSEStatusEvent {
  status: 'analyzing' | 'complete' | 'error'
  step?: string
  reportId?: string
  message?: string
}

export interface ReportModificationRequest {
  instruction: string
}

export interface ChangedSection {
  key: string
  before: string
  after: string
}

export interface ReportModificationResult {
  newContent: Record<string, string>
  changedSections: ChangedSection[]
}
