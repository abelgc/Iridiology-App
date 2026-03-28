'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportViewer } from '@/components/reports/report-viewer'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Report, ReportCorrection } from '@/types/database'

interface SessionData {
  session_date: string
}

interface PatientData {
  full_name: string
}

export default function ReportViewPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [reportId, setReportId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [corrections, setCorrections] = useState<ReportCorrection[]>([])
  const [session, setSession] = useState<SessionData | null>(null)
  const [patient, setPatient] = useState<PatientData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setReportId(p.id))
  }, [params])

  useEffect(() => {
    if (!reportId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch report
        const reportResponse = await fetch(`/api/reports/${reportId}`)
        if (!reportResponse.ok) {
          setError('Failed to load report')
          return
        }
        const reportData = await reportResponse.json()
        setReport(reportData)

        // Fetch corrections
        const correctionsResponse = await fetch(`/api/reports/${reportId}/corrections`)
        if (correctionsResponse.ok) {
          const correctionsData = await correctionsResponse.json()
          setCorrections(correctionsData)
        }

        // Fetch session for date
        if (reportData.session_id) {
          const sessionResponse = await fetch(`/api/sessions/${reportData.session_id}`)
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json()
            setSession(sessionData)

            // Fetch patient for name
            if (sessionData.patient_id) {
              const patientResponse = await fetch(`/api/patients/${sessionData.patient_id}`)
              if (patientResponse.ok) {
                const patientData = await patientResponse.json()
                setPatient(patientData)
              }
            }
          }
        }
      } catch (err) {
        setError('Failed to load report')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [reportId])

  if (!reportId) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900">{error}</p>
              <Button onClick={() => router.back()} className="mt-4">
                Go Back
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <p className="text-center text-gray-600">Report not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {patient?.full_name || 'Patient'} - Report
        </h1>
        {session && (
          <p className="text-gray-600">
            Session Date: {new Date(session.session_date).toLocaleDateString()}
          </p>
        )}
      </div>

      <ReportViewer report={report} corrections={corrections} />

      {/* Corrections section */}
      {corrections.length > 0 && (
        <Card className="p-6 mt-8 bg-blue-50 border-blue-200">
          <h2 className="text-xl font-semibold mb-4">Corrections History</h2>
          <div className="space-y-4">
            {corrections.map((correction) => (
              <div key={correction.id} className="border rounded-lg p-4 bg-white">
                <div className="font-medium mb-2">{correction.section_key}</div>
                {correction.correction_notes && (
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>Notes:</strong> {correction.correction_notes}
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {new Date(correction.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
