'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportEditor } from '@/components/reports/report-editor'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Report, ReportContent } from '@/types/database'

export default function ReportEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [reportId, setReportId] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setReportId(p.id))
  }, [params])

  useEffect(() => {
    if (!reportId) return

    const fetchReport = async () => {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/reports/${reportId}`)

        if (!response.ok) {
          setError('Failed to load report')
          return
        }

        const data = await response.json()
        setReport(data)
      } catch (err) {
        setError('Failed to load report')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchReport()
  }, [reportId])

  const handleSave = async (content: ReportContent) => {
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_content: content }),
      })

      if (!response.ok) {
        throw new Error('Failed to save report')
      }

      // Redirect back to view page
      router.push(`/reports/${reportId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save report')
    }
  }

  if (!reportId) {
    return <div className="text-center py-8">Loading...</div>
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto py-8">
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
      <div className="max-w-6xl mx-auto py-8">
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
      <div className="max-w-6xl mx-auto py-8">
        <p className="text-center text-gray-600">Report not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Report</h1>
        <p className="text-gray-600">Edit report sections and save your changes</p>
      </div>

      <ReportEditor report={report} onSave={handleSave} />
    </div>
  )
}
