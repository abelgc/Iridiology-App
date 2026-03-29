'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ImageUpload } from './image-upload'
import { ModeSelector } from './mode-selector'
import { ImageQualityWarning } from './image-quality-warning'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/lib/toast'
import type { Patient, Session } from '@/types/database'

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

type SSEStatus = 'idle' | 'analyzing' | 'complete' | 'error'

interface SSEEvent {
  status: SSEStatus
  step?: string
  reportId?: string
  message?: string
}

export function SessionForm({ defaultPatientId }: SessionFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const formDataRef = useRef<FormData | null>(null)

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

  const [sseStatus, setSSEStatus] = useState<SSEStatus>('idle')
  const [sseStep, setSSEStep] = useState<string>('')
  const [sseError, setSSEError] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isLoadingPatients, setIsLoadingPatients] = useState(true)
  const [imageQualityWarnings, setImageQualityWarnings] = useState<string[]>([])

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

    if (!validateForm()) {
      return
    }

    setSSEStatus('analyzing')
    setSSEStep('Sending images to AI...')
    setSSEError('')
    setImageQualityWarnings([])

    try {
      const patient = patients.find((p) => p.id === formData.patientId)
      if (!patient) {
        throw new Error('Patient not found')
      }

      const endpoint =
        formData.mode === 'standard'
          ? '/api/analyze'
          : formData.mode === 'comparison'
            ? '/api/compare'
            : '/api/review'

      const requestBody =
        formData.mode === 'standard'
          ? {
              patientId: formData.patientId,
              rightIrisBase64: formData.rightIrisBase64,
              leftIrisBase64: formData.leftIrisBase64,
              patientData: {
                full_name: patient.full_name,
                date_of_birth: patient.date_of_birth,
                gender: patient.gender,
                general_history: patient.general_history,
                symptoms: formData.symptoms || null,
                practitioner_notes: formData.practitionerNotes || null,
              },
            }
          : formData.mode === 'comparison'
            ? {
                patientId: formData.patientId,
                rightIrisBase64: formData.rightIrisBase64,
                leftIrisBase64: formData.leftIrisBase64,
                previousRightIrisBase64: formData.previousRightIrisBase64,
                previousLeftIrisBase64: formData.previousLeftIrisBase64,
                previousSessionDate: '',
                patientData: {
                  full_name: patient.full_name,
                  date_of_birth: patient.date_of_birth,
                  gender: patient.gender,
                  general_history: patient.general_history,
                  symptoms: formData.symptoms || null,
                  practitioner_notes: formData.practitionerNotes || null,
                },
              }
            : {
                patientId: formData.patientId,
                rightIrisBase64: formData.rightIrisBase64,
                leftIrisBase64: formData.leftIrisBase64,
                practitionerInterpretation: formData.practitionerInterpretation,
                patientData: {
                  full_name: patient.full_name,
                  date_of_birth: patient.date_of_birth,
                  gender: patient.gender,
                  general_history: patient.general_history,
                  symptoms: formData.symptoms || null,
                  practitioner_notes: formData.practitionerNotes || null,
                },
              }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Analysis failed')
      }

      // Parse SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response stream')
      }

      let reportId = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6))

              if (event.status === 'analyzing') {
                setSSEStep(event.step || '')
              } else if (event.status === 'complete') {
                setSSEStatus('complete')
                reportId = event.reportId || ''
              } else if (event.status === 'error') {
                setSSEStatus('error')
                setSSEError(event.message || 'Unknown error')
              }
            } catch (e) {
              // Invalid JSON, skip
            }
          }
        }
      }

      if (reportId) {
        // Redirect to report page
        router.push(`/reports/${reportId}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      setSSEStatus('error')
      setSSEError(errorMessage)
      formDataRef.current = formData

      // Show error toast with retry button
      toast({
        title: 'Analysis Error',
        description: errorMessage,
        variant: 'destructive',
        action: {
          label: 'Retry',
          onClick: () => {
            if (formDataRef.current) {
              handleSubmit({ preventDefault: () => {} } as React.FormEvent)
            }
          },
        },
      })
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
          onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
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
          onChange={(mode) => setFormData({ ...formData, mode })}
        />
      </Card>

      {/* Session Date */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Session Date</label>
        <input
          type="date"
          value={formData.sessionDate}
          onChange={(e) => setFormData({ ...formData, sessionDate: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </Card>

      {/* Symptoms */}
      <Card className="p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">Current Symptoms</label>
        <textarea
          value={formData.symptoms}
          onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
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
          onChange={(e) => setFormData({ ...formData, practitionerNotes: e.target.value })}
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
                onChange={(base64) => setFormData({ ...formData, rightIrisBase64: base64 })}
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
                onChange={(base64) => setFormData({ ...formData, leftIrisBase64: base64 })}
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
            <div className="border-t pt-6">
              <h3 className="font-medium text-gray-900 mb-4">Previous Session Images</h3>
              <div className="space-y-6">
                <div>
                  <ImageUpload
                    label="Previous Right Iris"
                    value={formData.previousRightIrisBase64}
                    onChange={(base64) =>
                      setFormData({ ...formData, previousRightIrisBase64: base64 })
                    }
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
                    onChange={(base64) =>
                      setFormData({ ...formData, previousLeftIrisBase64: base64 })
                    }
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
                    onChange={(base64) => setFormData({ ...formData, rightIrisBase64: base64 })}
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
                    onChange={(base64) => setFormData({ ...formData, leftIrisBase64: base64 })}
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
                onChange={(base64) => setFormData({ ...formData, rightIrisBase64: base64 })}
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
                onChange={(base64) => setFormData({ ...formData, leftIrisBase64: base64 })}
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
                onChange={(e) =>
                  setFormData({ ...formData, practitionerInterpretation: e.target.value })
                }
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

      {/* Image Quality Warning */}
      {imageQualityWarnings.length > 0 && (
        <Card className="p-6">
          <ImageQualityWarning warnings={imageQualityWarnings} />
        </Card>
      )}

      {/* Analysis Progress */}
      {sseStatus !== 'idle' && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <div className="space-y-4">
            {sseStatus === 'analyzing' && (
              <>
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="text-blue-600 animate-spin" />
                  <div>
                    <p className="font-medium text-blue-900">Analyzing...</p>
                    <p className="text-sm text-blue-700">{sseStep}</p>
                  </div>
                </div>
              </>
            )}
            {sseStatus === 'error' && (
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">{sseError}</p>
                <Button
                  type="button"
                  onClick={() => setSSEStatus('idle')}
                  className="mt-3"
                  variant="outline"
                >
                  Try Again
                </Button>
              </div>
            )}
            {sseStatus === 'complete' && (
              <div>
                <p className="font-medium text-green-900">Analysis Complete!</p>
                <p className="text-sm text-green-700 mt-1">Redirecting to report...</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex gap-3">
        <Button type="submit" size="lg" disabled={sseStatus === 'analyzing'}>
          {sseStatus === 'analyzing' ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            'Start Analysis'
          )}
        </Button>
      </div>
    </form>
  )
}
