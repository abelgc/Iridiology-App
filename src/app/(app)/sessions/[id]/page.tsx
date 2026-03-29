'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

interface Session {
  id: string
  patient_id: string
  created_at: string
  session_date: string
  analysis_mode: string
  status: 'pending' | 'analyzing' | 'completed' | 'error'
  symptoms: string | null
  practitioner_notes: string | null
  patients: {
    id: string
    full_name: string
    date_of_birth: string | null
    gender: string | null
    email: string | null
    phone: string | null
    general_history: string | null
    notes: string | null
  }
}

interface Report {
  id: string
  session_id: string
  created_at: string
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setSessionId(p.id))
  }, [params])

  useEffect(() => {
    if (!sessionId) return

    const fetchSession = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`)
        if (!response.ok) { setError('Failed to load session'); return }

        const data = await response.json()
        setSession(data)

        if (data.status === 'completed') {
          const reportResponse = await fetch(`/api/reports?sessionId=${sessionId}`)
          if (reportResponse.ok) {
            const reports = await reportResponse.json()
            if (reports.length > 0) setReport(reports[0])
          }
        }
      } catch (err) {
        setError('Failed to load session')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  // Poll every 4 seconds while analysis is running
  useEffect(() => {
    if (!sessionId || !session || session.status !== 'analyzing') return

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`)
        if (!response.ok) return
        const data = await response.json()
        setSession(data)

        if (data.status === 'completed') {
          clearInterval(interval)
          const reportResponse = await fetch(`/api/reports?sessionId=${sessionId}`)
          if (reportResponse.ok) {
            const reports = await reportResponse.json()
            if (reports.length > 0) setReport(reports[0])
          }
        } else if (data.status === 'error') {
          clearInterval(interval)
        }
      } catch { /* silent — keep polling */ }
    }, 4000)

    return () => clearInterval(interval)
  }, [sessionId, session?.status])

  if (!sessionId) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8">
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
      <div className="max-w-2xl mx-auto py-8">
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

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <p className="text-center text-gray-600">Session not found</p>
      </div>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
            <CheckCircle size={16} />
            Completed
          </div>
        )
      case 'analyzing':
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            <Clock size={16} />
            Analyzing
          </div>
        )
      case 'error':
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
            <AlertCircle size={16} />
            Error
          </div>
        )
      default:
        return (
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
            Pending
          </div>
        )
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Session Details</h1>
        <p className="text-gray-600">View session information and analysis results</p>
      </div>

      {/* Session Info */}
      <Card className="p-6 mb-6">
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Patient</p>
              <p className="text-lg font-semibold text-gray-900">{session.patients.full_name}</p>
            </div>
            <div>{getStatusBadge(session.status)}</div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Session Date</p>
              <p className="text-base text-gray-900">
                {new Date(session.session_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Analysis Mode</p>
              <p className="text-base text-gray-900 capitalize">{session.analysis_mode}</p>
            </div>
          </div>

          {session.symptoms && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Current Symptoms</p>
              <p className="text-gray-900">{session.symptoms}</p>
            </div>
          )}

          {session.practitioner_notes && (
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Practitioner Notes</p>
              <p className="text-gray-900">{session.practitioner_notes}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Status-specific content */}
      {session.status === 'completed' && report ? (
        <Card className="p-6 bg-green-50 border-green-200 mb-6">
          <div className="flex items-start gap-4">
            <CheckCircle className="text-green-600 flex-shrink-0 mt-1" size={24} />
            <div className="flex-1">
              <p className="font-medium text-green-900">Analysis Complete</p>
              <p className="text-sm text-green-800 mt-1">
                The AI analysis has been completed and saved successfully.
              </p>
              <Link href={`/reports/${report.id}`}>
                <Button className="mt-4" variant="default">
                  View Report
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {session.status === 'analyzing' ? (
        <Card className="p-6 bg-blue-50 border-blue-200 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
            </div>
            <div>
              <p className="font-medium text-blue-900">Analysis in Progress</p>
              <p className="text-sm text-blue-800 mt-1">
                The AI is analyzing the iris images. This may take a moment...
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {session.status === 'error' ? (
        <Card className="p-6 bg-red-50 border-red-200 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={24} />
              <div>
                <p className="font-medium text-red-900">Analysis Failed</p>
                <p className="text-sm text-red-800 mt-1">
                  There was an error during the analysis. Please try again or contact support.
                </p>
              </div>
            </div>
          </div>
          <Button onClick={() => router.push('/sessions/new')} className="mt-4" variant="outline">
            Start New Session
          </Button>
        </Card>
      ) : null}

      {/* Patient info */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h3>
        <div className="grid grid-cols-2 gap-4">
          {session.patients.date_of_birth && (
            <div>
              <p className="text-sm text-gray-600">Date of Birth</p>
              <p className="text-gray-900">
                {new Date(session.patients.date_of_birth).toLocaleDateString()}
              </p>
            </div>
          )}
          {session.patients.gender && (
            <div>
              <p className="text-sm text-gray-600">Gender</p>
              <p className="text-gray-900">{session.patients.gender}</p>
            </div>
          )}
          {session.patients.email && (
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-gray-900">{session.patients.email}</p>
            </div>
          )}
          {session.patients.phone && (
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="text-gray-900">{session.patients.phone}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
