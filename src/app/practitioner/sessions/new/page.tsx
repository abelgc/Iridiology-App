'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SessionForm } from '@/components/sessions/session-form'
import { Card } from '@/components/ui/card'

function NewSessionContent() {
  const searchParams = useSearchParams()
  const patientId = searchParams.get('patientId') || undefined

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Start New Analysis Session</h1>
        <p className="text-gray-600 mt-2">
          Create a new iris analysis session. Select your analysis mode, upload images, and let AI
          generate clinical insights.
        </p>
      </div>

      <SessionForm defaultPatientId={patientId} />
    </div>
  )
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
      <NewSessionContent />
    </Suspense>
  )
}
