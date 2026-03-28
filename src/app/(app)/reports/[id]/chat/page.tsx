'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportChat } from '@/components/reports/report-chat'
import { Button } from '@/components/ui/button'
import type { Report } from '@/types/database'

interface SessionData {
  session_date: string
}

interface PatientData {
  full_name: string
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [reportId, setReportId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
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
        setError('Failed to load report data')
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-8 w-64 mb-8" />
        <Card className="p-6 h-96">
          <Skeleton className="h-full" />
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
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

  if (!report || !patient || !session) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <p className="text-center text-gray-600">Data not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/reports/${reportId}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Report
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Chat about: {patient.full_name} — {new Date(session.session_date).toLocaleDateString()}
        </h1>
      </div>

      {/* Chat container */}
      <div className="h-96">
        <ReportChat
          reportId={reportId}
          patientName={patient.full_name}
        />
      </div>
    </div>
  )
}
