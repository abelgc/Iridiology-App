'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ImageUpload } from './image-upload'
import { ModeSelector } from './mode-selector'
import { ImageQualityWarning } from './image-quality-warning'
import { Loader2 } from 'lucide-react'

interface SessionFormProps {
  defaultPatientId?: string
}

type AnalysisMode = 'standard' | 'comparison' | 'technical_review'

interface PatientOption {
  id: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  general_history: string | null
}

interface LastSessionInfo {
  session_date: string
  analysis_mode: string
}

interface FormData {
  patientId: string
  mode: AnalysisMode
  sessionDate: string
  symptoms: string
  practitionerNotes: string
  rightIrisBase64: string | null
  leftIrisBase64: string | null
  previousRightIrisBase64: string | null
  previousLeftIrisBase64: string | null
  practitionerInterpretation: string
}


export function SessionForm({ defaultPatientId }: SessionFormProps) {
  const router = useRouter()

  const [patients, setPatients] = useState<PatientOption[]>([])
  const [formData, setFormData] = useState<FormData>({
    patientId: defaultPatientId || '',
    mode: 'standard',
    sessionDate: new Date().toISOString().split('T')[0],
    symptoms: '',
    practitionerNotes: '',
    rightIrisBase64: null,
    leftIrisBase64: null,
    previousRightIrisBase64: null,
    previousLeftIrisBase64: null,
    practitionerInterpretation: '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isLoadingPatients, setIsLoadingPatients] = useState(true)
  const [imageQualityWarnings, setImageQualityWarnings] = useState<string[]>([])
  const [lastSession, setLastSession] = useState<LastSessionInfo | null>(null)

  // Load patients on mount
  useEffect(() => {
    const loadPatients = async () => {
      try {
        const response = await fetch('/api/patients')
        if (response.ok) {
          const data = await response.json()
          setPatients(data)
        }
      } catch (error) {
        console.error('Failed to load patients:', error)
      } finally {
        setIsLoadingPatients(false)
      }
    }

    loadPatients()
  }, [])

  // Auto-load last session when comparison mode + patient selected
  useEffect(() => {
    if (formData.mode !== 'comparison' || !formData.patientId) {
      setLastSession(null)
      return
    }

    const loadLastSession = async () => {
      try {
        const res = await fetch(`/api/sessions?patientId=${formData.patientId}`)
        if (!res.ok) return
        const sessions: Array<{ session_date: string; status: string; analysis_mode: string }> = await res.json()
        const last = sessions.find((s) => s.status === 'completed')
        setLastSession(last ? { session_date: last.session_date, analysis_mode: last.analysis_mode } : null)
      } catch {
        // silently ignore
      }
    }

    loadLastSession()
  }, [formData.patientId, formData.mode])

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.patientId) {
      errors.patientId = 'Patient selection is required'
    }

    if (formData.mode === 'standard') {
      if (!formData.rightIrisBase64) {
        errors.rightIris = 'Right iris image is required for standard analysis'
      }
      if (!formData.leftIrisBase64) {
        errors.leftIris = 'Left iris image is required for standard analysis'
      }
    }

    if (formData.mode === 'comparison') {
      if (!formData.previousRightIrisBase64) {
        errors.previousRightIris = 'Previous right iris image is required for comparison'
      }
      if (!formData.previousLeftIrisBase64) {
        errors.previousLeftIris = 'Previous left iris image is required for comparison'
      }
      if (!formData.rightIrisBase64) {
        errors.rightIris = 'Current right iris image is required for comparison'
      }
      if (!formData.leftIrisBase64) {
        errors.leftIris = 'Current left iris image is required for comparison'
      }
    }

    if (formData.mode === 'technical_review') {
      if (!formData.rightIrisBase64) {
        errors.rightIris = 'Right iris image is required for technical review'
      }
      if (!formData.leftIrisBase64) {
        errors.leftIris = 'Left iris image is required for technical review'
      }
      if (!formData.practitionerInterpretation.trim()) {
        errors.interpretation = 'Your interpretation is required for technical review'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)
    setSubmitError('')

    try {
      const patient = patients.find((p) => p.id === formData.patientId)
      if (!patient) throw new Error('Patient not found')

      const patientData = {
        full_name: patient.full_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        general_history: patient.general_history,
        symptoms: formData.symptoms || null,
        practitioner_notes: formData.practitionerNotes || null,
      }

      const endpoint =
        formData.mode === 'standard' ? '/api/analyze'
        : formData.mode === 'comparison' ? '/api/compare'
        : '/api/review'

      const requestBody =
        formData.mode === 'standard'
          ? { patientId: formData.patientId, rightIrisBase64: formData.rightIrisBase64, leftIrisBase64: formData.leftIrisBase64, patientData }
          : formData.mode === 'comparison'
            ? { patientId: formData.patientId, rightIrisBase64: formData.rightIrisBase64, leftIrisBase64: formData.leftIrisBase64, previousRightIrisBase64: formData.previousRightIrisBase64, previousLeftIrisBase64: formData.previousLeftIrisBase64, previousSessionDate: '', patientData }
            : { patientId: formData.patientId, rightIrisBase64: formData.rightIrisBase64, leftIrisBase64: formData.leftIrisBase64, practitionerInterpretation: formData.practitionerInterpretation, patientData }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || err.error || 'Failed to start analysis')
      }

      const { sessionId } = await response.json()
      // Analysis runs in background on server — safe to navigate away
      router.push(`/sessions/${sessionId}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'An error occurred')
      setIsSubmitting(false)
    }
  }

  if (isLoadingPatients) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      {/* Patient Selector */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Patient
          <span className="text-red-500 ml-1">*</span>
        </label>
        <select
          value={formData.patientId}
          onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, patientId: v })) }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">Select a patient...</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.full_name}
            </option>
          ))}
        </select>
        {validationErrors.patientId && (
          <p className="text-sm text-red-600 mt-1">{validationErrors.patientId}</p>
        )}
        {formData.patientId && (() => {
          const selected = patients.find(p => p.id === formData.patientId)
          if (!selected?.general_history) return null
          return (
            <div className="mt-4 p-3 rounded-lg bg-[oklch(0.95_0.01_175)] border border-[oklch(0.85_0.03_175)]">
              <p className="text-xs font-semibold text-[oklch(0.38_0.08_175)] mb-1">Patient History</p>
              <p className="text-sm text-[oklch(0.30_0.04_175)]">{selected.general_history}</p>
            </div>
          )
        })()}
      </Card>

      {/* Mode Selector */}
      <Card className="p-6">
        <ModeSelector
          value={formData.mode}
          onChange={(mode) => setFormData(prev => ({ ...prev, mode }))}
        />
      </Card>

      {/* Session Date */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Session Date</label>
        <input
          type="date"
          value={formData.sessionDate}
          onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, sessionDate: v })) }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </Card>

      {/* Symptoms */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Current Symptoms</label>
        <textarea
          value={formData.symptoms}
          onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, symptoms: v })) }}
          rows={3}
          placeholder="Enter any current symptoms..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </Card>

      {/* Practitioner Notes */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Practitioner Notes</label>
        <textarea
          value={formData.practitionerNotes}
          onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, practitionerNotes: v })) }}
          rows={3}
          placeholder="Enter any relevant notes..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </Card>

      {/* Images based on mode */}
      <Card className="p-6 space-y-6">
        {formData.mode === 'standard' && (
          <>
            <div>
              <ImageUpload
                label="Right Iris"
                value={formData.rightIrisBase64}
                onChange={(base64) => setFormData(prev => ({ ...prev, rightIrisBase64: base64 }))}
                required={true}
              />
              {validationErrors.rightIris && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.rightIris}</p>
              )}
            </div>
            <div>
              <ImageUpload
                label="Left Iris"
                value={formData.leftIrisBase64}
                onChange={(base64) => setFormData(prev => ({ ...prev, leftIrisBase64: base64 }))}
                required={true}
              />
              {validationErrors.leftIris && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.leftIris}</p>
              )}
            </div>
          </>
        )}

        {formData.mode === 'comparison' && (
          <>
            {lastSession && (
              <div className="p-3 rounded-lg bg-[oklch(0.97_0.04_65)] border border-[oklch(0.85_0.08_65)]">
                <p className="text-xs font-semibold text-[oklch(0.45_0.10_65)] mb-1">Last Session on File</p>
                <p className="text-sm text-[oklch(0.30_0.06_65)]">
                  {new Date(lastSession.session_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' — '}
                  <span className="capitalize">{lastSession.analysis_mode.replace('_', ' ')}</span>
                </p>
                <p className="text-xs text-[oklch(0.55_0.08_65)] mt-1">Previous report findings will be used as context for the comparison analysis.</p>
              </div>
            )}
            {!lastSession && formData.patientId && (
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-sm text-gray-500">No previous completed session found for this patient.</p>
              </div>
            )}
            <div className="border-t pt-6">
              <h3 className="font-medium text-gray-900 mb-4">Previous Session Images</h3>
              <div className="space-y-6">
                <div>
                  <ImageUpload
                    label="Previous Right Iris"
                    value={formData.previousRightIrisBase64}
                    onChange={(base64) => setFormData(prev => ({ ...prev, previousRightIrisBase64: base64 }))}
                    required={true}
                  />
                  {validationErrors.previousRightIris && (
                    <p className="text-sm text-red-600 mt-1">{validationErrors.previousRightIris}</p>
                  )}
                </div>
                <div>
                  <ImageUpload
                    label="Previous Left Iris"
                    value={formData.previousLeftIrisBase64}
                    onChange={(base64) => setFormData(prev => ({ ...prev, previousLeftIrisBase64: base64 }))}
                    required={true}
                  />
                  {validationErrors.previousLeftIris && (
                    <p className="text-sm text-red-600 mt-1">{validationErrors.previousLeftIris}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="font-medium text-gray-900 mb-4">Current Session Images</h3>
              <div className="space-y-6">
                <div>
                  <ImageUpload
                    label="Current Right Iris"
                    value={formData.rightIrisBase64}
                    onChange={(base64) => setFormData(prev => ({ ...prev, rightIrisBase64: base64 }))}
                    required={true}
                  />
                  {validationErrors.rightIris && (
                    <p className="text-sm text-red-600 mt-1">{validationErrors.rightIris}</p>
                  )}
                </div>
                <div>
                  <ImageUpload
                    label="Current Left Iris"
                    value={formData.leftIrisBase64}
                    onChange={(base64) => setFormData(prev => ({ ...prev, leftIrisBase64: base64 }))}
                    required={true}
                  />
                  {validationErrors.leftIris && (
                    <p className="text-sm text-red-600 mt-1">{validationErrors.leftIris}</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {formData.mode === 'technical_review' && (
          <>
            <div>
              <ImageUpload
                label="Right Iris"
                value={formData.rightIrisBase64}
                onChange={(base64) => setFormData(prev => ({ ...prev, rightIrisBase64: base64 }))}
                required={true}
              />
              {validationErrors.rightIris && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.rightIris}</p>
              )}
            </div>
            <div>
              <ImageUpload
                label="Left Iris"
                value={formData.leftIrisBase64}
                onChange={(base64) => setFormData(prev => ({ ...prev, leftIrisBase64: base64 }))}
                required={true}
              />
              {validationErrors.leftIris && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.leftIris}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Your Interpretation
                <span className="text-red-500 ml-1">*</span>
              </label>
              <textarea
                value={formData.practitionerInterpretation}
                onChange={(e) => { const v = e.target.value; setFormData(prev => ({ ...prev, practitionerInterpretation: v })) }}
                rows={4}
                placeholder="Enter your professional interpretation..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {validationErrors.interpretation && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.interpretation}</p>
              )}
            </div>
          </>
        )}
      </Card>

      {submitError && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">{submitError}</p>
        </Card>
      )}

      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            'Start Analysis'
          )}
        </Button>
      </div>
    </form>
  )
}
